import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { promises as fs } from "fs";
import { IActionContext } from "@microsoft/vscode-azext-utils";
import * as containerAssistModule from "../../../commands/aksContainerAssist/aksContainerAssist";
import { ContainerAssistAction, ContainerAssistQuickPickItem } from "../../../commands/aksContainerAssist/types";
import * as containerAssistServiceModule from "../../../commands/aksContainerAssist/containerAssistService";

const { runContainerAssist } = containerAssistModule;

describe("runContainerAssist Command", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("errors when target is not a URI", async () => {
        const showErrorStub = sandbox.stub(vscode.window, "showErrorMessage");

        await runContainerAssist({} as IActionContext, null);

        assert.ok(showErrorStub.calledOnce);
        assert.ok(showErrorStub.firstCall.args[0].includes("right-click on a folder"));
    });

    it("errors when folder not in workspace", async () => {
        const showErrorStub = sandbox.stub(vscode.window, "showErrorMessage");
        sandbox.stub(vscode.workspace, "getWorkspaceFolder").returns(undefined);

        await runContainerAssist({} as IActionContext, vscode.Uri.file("/test/path"));

        assert.ok(showErrorStub.calledOnce);
        assert.ok(showErrorStub.firstCall.args[0].includes("not part of a workspace"));
    });

    it("errors when Container Assist disabled", async () => {
        const showErrorStub = sandbox.stub(vscode.window, "showErrorMessage");
        const testUri = vscode.Uri.file("/test/path");

        sandbox.stub(vscode.workspace, "getWorkspaceFolder").returns({
            uri: testUri,
            name: "test",
            index: 0,
        } as vscode.WorkspaceFolder);
        sandbox.stub(vscode.workspace, "getConfiguration").returns({
            get: sandbox.stub().returns(false),
        } as Partial<vscode.WorkspaceConfiguration> as vscode.WorkspaceConfiguration);

        await runContainerAssist({} as IActionContext, testUri);

        assert.ok(showErrorStub.calledOnce);
        assert.ok(showErrorStub.firstCall.args[0].includes("Container Assist is not enabled"));
    });

    it("returns on cancelled QuickPick", async () => {
        const testUri = vscode.Uri.file("/test/path");

        sandbox.stub(vscode.workspace, "getWorkspaceFolder").returns({
            uri: testUri,
            name: "test",
            index: 0,
        } as vscode.WorkspaceFolder);
        sandbox.stub(vscode.workspace, "getConfiguration").returns({
            get: sandbox.stub().returns(true),
        } as Partial<vscode.WorkspaceConfiguration> as vscode.WorkspaceConfiguration);
        sandbox.stub(fs, "stat").resolves({ isFile: () => false } as Awaited<ReturnType<typeof fs.stat>>);
        sandbox.stub(fs, "readdir").resolves([]);
        sandbox.stub(fs, "access").rejects(new Error("File not found"));
        const showQuickPickStub = sandbox.stub(vscode.window, "showQuickPick").resolves(undefined);

        await runContainerAssist({} as IActionContext, testUri);

        assert.ok(showQuickPickStub.calledOnce);
    });

    it("has correctly structured QuickPick items", async () => {
        const testUri = vscode.Uri.file("/test/path");

        sandbox.stub(vscode.workspace, "getWorkspaceFolder").returns({
            uri: testUri,
            name: "test",
            index: 0,
        } as vscode.WorkspaceFolder);
        sandbox.stub(vscode.workspace, "getConfiguration").returns({
            get: sandbox.stub().returns(true),
        } as Partial<vscode.WorkspaceConfiguration> as vscode.WorkspaceConfiguration);
        sandbox.stub(fs, "stat").resolves({ isFile: () => false } as Awaited<ReturnType<typeof fs.stat>>);
        sandbox.stub(fs, "readdir").resolves([]);
        sandbox.stub(fs, "access").rejects(new Error("File not found"));

        const capturedItems: ContainerAssistQuickPickItem[] = [];
        sandbox.stub(vscode.window, "showQuickPick").callsFake((items: unknown) => {
            if (Array.isArray(items)) {
                capturedItems.push(...(items as ContainerAssistQuickPickItem[]));
            }
            return Promise.resolve(undefined);
        });

        await runContainerAssist({} as IActionContext, testUri);

        assert.strictEqual(capturedItems.length, 2);
        assert.ok(capturedItems[0].label.includes("Generate Deployment Files"));
        assert.ok(capturedItems[1].label.includes("Generate GitHub Workflow"));
        assert.strictEqual(capturedItems[0].action, ContainerAssistAction.GenerateDeployment);
        assert.strictEqual(capturedItems[1].action, ContainerAssistAction.GenerateWorkflow);
    });

    describe("hasBothActions post-generation options", () => {
        let testUri: vscode.Uri;
        let workspaceFolder: vscode.WorkspaceFolder;
        let showInformationMessageStub: sinon.SinonStub;

        beforeEach(() => {
            testUri = vscode.Uri.file("/test/path");
            workspaceFolder = {
                uri: testUri,
                name: "test",
                index: 0,
            } as vscode.WorkspaceFolder;

            // Setup common stubs
            sandbox.stub(vscode.workspace, "getWorkspaceFolder").returns(workspaceFolder);
            sandbox.stub(vscode.workspace, "getConfiguration").returns({
                get: sandbox.stub().returns(true),
            } as Partial<vscode.WorkspaceConfiguration> as vscode.WorkspaceConfiguration);
            sandbox.stub(fs, "stat").resolves({ isFile: () => false } as Awaited<ReturnType<typeof fs.stat>>);
            sandbox.stub(fs, "readdir").resolves([]);
            sandbox.stub(fs, "access").rejects(new Error("File not found"));

            // Mock ContainerAssistService
            sandbox.stub(containerAssistServiceModule.ContainerAssistService.prototype, "isAvailable").resolves({
                succeeded: true,
                result: true,
            });

            showInformationMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined);
        });

        it("should not show post-generation options when both actions selected but no files generated", async () => {
            const quickPickItems: ContainerAssistQuickPickItem[] = [
                {
                    label: "Generate Deployment Files",
                    action: ContainerAssistAction.GenerateDeployment,
                    picked: false,
                },
                {
                    label: "Generate GitHub Workflow",
                    action: ContainerAssistAction.GenerateWorkflow,
                    picked: false,
                },
            ];

            sandbox.stub(vscode.window, "showQuickPick").resolves(quickPickItems as any);

            // Mock processContainerAssistAction to return undefined (simulating failure/cancellation)
            sandbox.stub(containerAssistModule, "processContainerAssistAction").resolves(undefined);

            await runContainerAssist({} as IActionContext, testUri);

            // showInformationMessage should NOT be called when no files are generated
            assert.strictEqual(showInformationMessageStub.callCount, 0);
        });
    });
});
