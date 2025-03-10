import path = require("path");
import * as fs from 'fs';
import { getExtensionPath } from "./host";
import * as vscode from 'vscode';
import { Errorable, failed } from "./errorable";

export function getWorkflowYaml(workflowName: string) : Errorable<string> {
    const extensionPath = getExtensionPath();
    if (failed(extensionPath)) {
        return extensionPath;
    }

    const yamlPathOnDisk = vscode.Uri.file(path.join(extensionPath.result, 'resources', 'yaml', `${workflowName}.yml`));
    try {
        const content = fs.readFileSync(yamlPathOnDisk.fsPath, 'utf8');
        return { succeeded: true, result: content };
    } catch (e) {
        return { succeeded: false, error: `Failed to read ${yamlPathOnDisk}: ${e}`};
    }
}

export function substituteClusterInWorkflowYaml(
    workflowYaml: string,
    resourceGroupName: string,
    clusterName: string
): string {
    return workflowYaml
        .replace('your-resource-group', resourceGroupName)
        .replace('your-cluster-name', clusterName);
}
