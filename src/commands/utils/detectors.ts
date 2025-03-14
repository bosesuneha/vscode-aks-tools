import { Errorable, combine, failed, getErrorMessage } from "./errorable";
import AksClusterTreeItem from '../../tree/aksClusterTreeItem';
import * as fs from 'fs';
import * as path from 'path';
import { ARMResponse, CategoryDetectorARMResponse, SingleDetectorARMResponse, isCategoryDataset } from "../../webview-contract/webviewDefinitions/detector";
import { getResourceManagementClient } from "./clusters";
const tmp = require('tmp');
const meta = require('../../../package.json');

/**
 * Can be used to store the JSON responses for a collection of category detectors and all their child detectors.
 */
export async function saveAllDetectorResponses(
    target: AksClusterTreeItem,
    categoryDetectorIds: string[]
) {
    const outputDirObj = tmp.dirSync();

    function saveDetector(detector: ARMResponse<any>) {
        const detectorFilePath = path.join(outputDirObj.name, `${detector.name}.json`);
        // Anonymize the data.
        detector.id = "/subscriptions/12345678-1234-1234-1234-1234567890ab/resourcegroups/test-rg/providers/Microsoft.ContainerService/managedClusters/test-cluster/detectors/" + detector.name;
        fs.writeFileSync(detectorFilePath, JSON.stringify(detector, null, 2));
    }

    for (let categoryDetectorId of categoryDetectorIds) {
        const categoryDetector = await getDetectorInfo(target, categoryDetectorId);
        if (failed(categoryDetector)) {
            throw new Error(`Error getting category detector ${categoryDetectorId}: ${getErrorMessage(categoryDetector.error)}`);
        }

        saveDetector(categoryDetector.result);

        const singleDetectors = await getDetectorListData(target, categoryDetector.result);
        if (failed(singleDetectors)) {
            throw new Error(`Error getting single detectors for ${categoryDetectorId}: ${getErrorMessage(singleDetectors.error)}`);
        }

        for (let singleDetector of singleDetectors.result) {
            saveDetector(singleDetector);
        }
    }
}

export async function getDetectorListData(
    cloudTarget: AksClusterTreeItem,
    categoryDetector: CategoryDetectorARMResponse
): Promise<Errorable<SingleDetectorARMResponse[]>> {

    const detectorIds = categoryDetector.properties.dataset.filter(isCategoryDataset)[0].renderingProperties.detectorIds;
    if (detectorIds.length === 0) {
        return { succeeded: false, error: `No detectors found in AppLens response for ${categoryDetector.name}` };
    }

    let results: Errorable<SingleDetectorARMResponse>[] = [];
    try {
        const promiseResults = await Promise.all(detectorIds.map(name => getDetectorInfo(cloudTarget, name)));
        // Line below is added to handle edge case of applens detector list with missing implementation,
        // due to internal server error it causes rest of list to fail.
        results = promiseResults.filter((x) => x.succeeded);
    } catch (err) {
        // This would be unexpected even in the event of network failure, because the individual promises handle
        // their own errors.
        return { succeeded: false, error: `Failed to retrieve detector data for ${categoryDetector.name}` };
    }

    return combine(results);
}

export async function getDetectorInfo(
    target: AksClusterTreeItem,
    detectorName: string
): Promise<Errorable<ARMResponse<any>>> {
    try {
        const client = getResourceManagementClient(target);
        // armid is in the format: /subscriptions/<sub_id>/resourceGroups/<resource_group>/providers/<container_service>/managedClusters/<aks_clustername>
        const resourceGroup = target.armId.split("/")[4];
        const detectorInfo = await client.resources.get(
            resourceGroup, target.resourceType,
            target.name, "detectors", detectorName, "2019-08-01");

        return { succeeded: true, result: <ARMResponse<any>>detectorInfo };
    } catch (ex) {
        return { succeeded: false, error: `Error invoking ${detectorName} detector: ${ex}` };
    }
}

export function getPortalUrl(clusterdata: ARMResponse<any>) {
    return `https://portal.azure.com/#resource${clusterdata.id.split('detectors')[0]}aksDiagnostics?referrer_source=vscode&referrer_context=${meta.name}`;
}
