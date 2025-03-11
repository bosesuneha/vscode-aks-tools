import * as vscode from "vscode";
import * as k8s from "vscode-kubernetes-tools-api";
import { IActionContext } from "@microsoft/vscode-azext-utils";
import { chooseStorageAccount, getKubernetesClusterInfo } from "../utils/clusters";
import { getExtension, longRunning } from "../utils/host";
import * as tmpfile from "../utils/tempfile";
import path from "path";
import { ensureDirectoryInPath } from "../utils/env";
import { getRetinaBinaryPath } from "../utils/helper/retinaBinaryDownload";
import { getVersion, invokeKubectlCommand } from "../utils/kubectl";
import { RetinaCapturePanel, RetinaCaptureProvider } from "../../panels/RetinaCapturePanel";
import { failed } from "../utils/errorable";
import { getLinuxNodes } from "../../panels/utilities/KubectlNetworkHelper";
import { getReadySessionProvider } from "../../auth/azureAuth";
import { getClusterDiagnosticSettings } from "../utils/clusters";
import { getAksClusterTreeNode } from "../utils/clusters";
import { getBlobStorageInfo, getSASKey, LinkDuration } from "../utils/azurestorage";

export async function aksUploadRetinaCapture(_context: IActionContext, target: unknown): Promise<void> {
    const kubectl = await k8s.extension.kubectl.v1;
    const cloudExplorer = await k8s.extension.cloudExplorer.v1;
    const clusterExplorer = await k8s.extension.clusterExplorer.v1;

    const sessionProvider = await getReadySessionProvider();
    if (failed(sessionProvider)) {
        vscode.window.showErrorMessage(sessionProvider.error);
        return;
    }

    if (!kubectl.available) {
        vscode.window.showWarningMessage(`Kubectl is unavailable.`);
        return;
    }

    if (!cloudExplorer.available) {
        vscode.window.showWarningMessage(`Cloud explorer is unavailable.`);
        return;
    }

    if (!clusterExplorer.available) {
        vscode.window.showWarningMessage(`Cluster explorer is unavailable.`);
        return;
    }

    const clusterInfo = await getKubernetesClusterInfo(sessionProvider.result, target, cloudExplorer, clusterExplorer);
    if (failed(clusterInfo)) {
        vscode.window.showErrorMessage(clusterInfo.error);
        return;
    }

    const clusterNode = getAksClusterTreeNode(target, cloudExplorer);
    if (failed(clusterNode)) {
        vscode.window.showErrorMessage(clusterNode.error);
        return;
    }

    const kubeConfigFile = await tmpfile.createTempFile(clusterInfo.result.kubeconfigYaml, "yaml");

    // Get diagnostic settings for the cluster
    const clusterDiagnosticSettings = await getClusterDiagnosticSettings(sessionProvider.result, clusterNode.result);
    if (!clusterDiagnosticSettings || !clusterDiagnosticSettings.value?.length) {
        vscode.window.showErrorMessage(
            "No storage account is attached to the diagnostic setting. Please attach a storage account and try again.",
        );
        return;
    }

    // TODO: If diagnostic settings are available but no storage account attached, don't move forward. Render webview with error message.

    // Get storage account selected by user to upload artifacts or default if only one storage account is available.
    const clusterStorageAccountId = await chooseStorageAccount(
        clusterDiagnosticSettings,
        "Select storage account to upload artifacts:",
    );
    if (!clusterStorageAccountId) return;

    // Get storage account details
    const storageInfo = await getBlobStorageInfo(sessionProvider.result, clusterNode.result, clusterStorageAccountId);
    if (failed(storageInfo)) {
        vscode.window.showErrorMessage(storageInfo.error);
        return;
    }

    // Get SAS key
    const sasKey = getSASKey(clusterStorageAccountId, storageInfo.result.storageKey, LinkDuration.OneHour);

    // Construct SAS URI
    const SAS_URI = `${storageInfo.result.blobEndpoint}${sasKey}`;

    const kubectlRetinaPath = await getRetinaBinaryPath();
    if (failed(kubectlRetinaPath)) {
        vscode.window.showWarningMessage(`kubectl retina path was not found ${kubectlRetinaPath.error}`);
        return;
    }

    ensureDirectoryInPath(path.dirname(kubectlRetinaPath.result));

    const extension = getExtension();
    if (failed(extension)) {
        vscode.window.showErrorMessage(extension.error);
        return;
    }

    // Get all Linux Nodes For this Cluster
    const linuxNodesList = await getLinuxNodes(kubectl, kubeConfigFile.filePath);
    if (failed(linuxNodesList)) {
        vscode.window.showErrorMessage(linuxNodesList.error);
        return;
    }

    // Pick a Node to Capture Traffic From
    const nodeNamesSelected = await vscode.window.showQuickPick(linuxNodesList.result, {
        canPickMany: true,
        placeHolder: "Please select all the Nodes you want Retina to capture traffic from.",
        title: "Select Nodes to Capture Traffic From",
    });

    if (!nodeNamesSelected) {
        vscode.window.showErrorMessage("No nodes were selected to capture traffic.");
        return;
    }

    const selectedNodes = nodeNamesSelected.join(",");

    if (!selectedNodes) {
        return;
    }

    // Retina Run Capture
    const captureName = `retina-capture-${clusterInfo.result.name.toLowerCase()}`;
    const retinaCaptureResult = await longRunning(
        `Retina Distributed Capture running for cluster ${clusterInfo.result.name}.`,
        async () => {
            return await invokeKubectlCommand(
                kubectl,
                kubeConfigFile.filePath,
                `retina capture create --namespace default --name ${captureName} --host-path /mnt/capture --node-selectors "kubernetes.io/os=linux" --node-names "${selectedNodes}" --no-wait=false --blob-upload="${SAS_URI}"`,
            );
        },
    );

    if (failed(retinaCaptureResult)) {
        vscode.window.showErrorMessage(`Failed to capture the cluster: ${retinaCaptureResult.error}`);
        return;
    }

    if (retinaCaptureResult.result.stdout && retinaCaptureResult.result.code === 0) {
        vscode.window.showInformationMessage(
            `Retina distributed capture is successfully completed for the cluster ${clusterInfo.result.name}`,
        );
    }

    const kubectlVersion = await getVersion(kubectl, kubeConfigFile.filePath);
    if (failed(kubectlVersion)) {
        vscode.window.showErrorMessage(kubectlVersion.error);
        return;
    }

    const foldername = `${captureName}_${new Date().toJSON().replaceAll(":", "")}`;

    // find if node explorer pod already exists
    let nodeExplorerPodExists = false;
    const nodeExplorerPod = await invokeKubectlCommand(
        kubectl,
        kubeConfigFile.filePath,
        `get pods -n default -l app=node-explorer`,
    );

    if (
        nodeExplorerPod.succeeded &&
        nodeExplorerPod.result.stdout &&
        nodeExplorerPod.result.stdout.includes("node-explorer")
    ) {
        nodeExplorerPodExists = true;
    }

    const dataProvider = new RetinaCaptureProvider(
        kubectl,
        kubectlVersion.result,
        kubeConfigFile.filePath,
        clusterInfo.result.name,
        retinaCaptureResult.result.stdout,
        selectedNodes.split(","),
        `${foldername}`,
        nodeExplorerPodExists,
    );

    const panel = new RetinaCapturePanel(extension.result.extensionUri);
    panel.show(dataProvider, kubeConfigFile);
}
