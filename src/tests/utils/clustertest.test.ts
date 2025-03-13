import * as sinon from "sinon";
import { jest } from "@jest/globals";
import { ReadyAzureSessionProvider } from "../../auth/types";
import { AksClusterTreeNode } from "../../tree/aksClusterTreeItem";
import * as arm from "../../commands/utils/arm";
import { getClusterDiagnosticSettings } from "../../commands/utils/clusters";
import { MonitorClient } from "@azure/arm-monitor";
import { beforeEach, describe, it } from "node:test";
import expect from "expect";

describe("getClusterDiagnosticSettings", () => {
    let mockSessionProvider: ReadyAzureSessionProvider;
    let mockClusterNode: AksClusterTreeNode;

    beforeEach(() => {
        mockSessionProvider = {} as ReadyAzureSessionProvider;
        mockClusterNode = {
            subscriptionId: "mock-subscription-id",
            armId: "/subscriptions/mock-subscription-id/resourceGroups/mock-rg/providers/Microsoft.ContainerService/managedClusters/mock-cluster",
        } as AksClusterTreeNode;
    });

    it("should return diagnostic settings when API call is successful", async () => {
        const mockClient = {
            diagnosticSettings: {
                list: jest
                    .fn<() => Promise<{ value: { name: string }[] }>>()
                    .mockResolvedValue({ value: [{ name: "test-setting" }] }),
            },
        };
        sinon.stub(arm, "getMonitorClient").returns(mockClient as unknown as MonitorClient);

        const result = await getClusterDiagnosticSettings(mockSessionProvider, mockClusterNode);

        expect(result).toEqual({ value: [{ name: "test-setting" }] });
    });

    it("should return undefined and show error message when API call fails", async () => {
        const mockClient = {
            diagnosticSettings: { list: jest.fn<() => Promise<never>>().mockRejectedValue(new Error("API failure")) },
        };
        sinon.stub(arm, "getMonitorClient").returns(mockClient as unknown as MonitorClient);
        const showErrorStub = sinon.stub("showErrorMessage");

        const result = await getClusterDiagnosticSettings(mockSessionProvider, mockClusterNode);

        expect(result).toBeUndefined();
        expect(showErrorStub).toBeTruthy();
    });
});
