import { VSCodeButton, VSCodeCheckbox, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrashCan, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import styles from "./InspektorGadget.module.css";
import { FormEvent, useState } from "react";
import { getWebviewMessageContext } from "../utilities/vscode";
import { NewTraceDialog } from "./NewTraceDialog";
import { ClusterResources, Nodes } from "./helpers/clusterResources";
import { GadgetConfiguration, TraceGadget, getGadgetMetadata, toGadgetArguments } from "./helpers/gadgets";
import { GadgetCategory } from "./helpers/gadgets/types";
import { TraceOutput } from "./TraceOutput";
import { NamespaceFilter, NamespaceSelection } from "../../../src/webview-contract/webviewDefinitions/inspektorGadget";
import { UserMsgDef } from "./helpers/userCommands";
import { EventHandlers } from "../utilities/state";

export interface TracesProps {
    category: GadgetCategory
    traces: TraceGadget[]
    nodes: Nodes
    resources: ClusterResources
    onRequestTraceId: () => number
    userMessageHandlers: EventHandlers<UserMsgDef>
}

const streamingCategories: GadgetCategory[] = ["top", "trace"];

export function Traces(props: TracesProps) {
    const vscode = getWebviewMessageContext<"gadget">();

    const [isNewTraceDialogShown, setIsTraceDialogShown] = useState(false);
    const [checkedTraceIds, setCheckedTraceIds] = useState<number[]>([]);
    const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);
    const [isWatching, setIsWatching] = useState<boolean>(false);
    const isStreamingTrace = streamingCategories.includes(props.category);

    function handleAdd() {
        setIsTraceDialogShown(true);
    }

    function ignoreClick(e: Event | FormEvent<HTMLElement>) {
        e.preventDefault();
        e.stopPropagation();
    }

    function toggleCheckedTraceId(traceId: number) {
        if (checkedTraceIds.includes(traceId)) {
            setCheckedTraceIds(checkedTraceIds.filter(id => id !== traceId));
        } else {
            setCheckedTraceIds(checkedTraceIds.concat(traceId));
        }
    }

    function toggleIsWatching(trace: TraceGadget) {
        if (!isStreamingTrace) {
            return;
        }

        if (isWatching) {
            vscode.postMessage({ command: "stopStreamingTraceRequest", parameters: undefined });
        } else {
            vscode.postMessage({ command: "runStreamingTraceRequest", parameters: {arguments: toGadgetArguments(trace), traceId: trace.traceId} });
        }

        setIsWatching(!isWatching);
    }

    function handleDelete() {
        if (selectedTraceId !== null && checkedTraceIds.includes(selectedTraceId)) {
            if (isWatching && isStreamingTrace) {
                vscode.postMessage({ command: "stopStreamingTraceRequest", parameters: undefined });
            }

            setSelectedTraceId(null);
        }

        props.userMessageHandlers.onDeleteTraces({traceIds: checkedTraceIds});
        setCheckedTraceIds([]);
    }

    function handleNewTraceDialogCancel() {
        setIsTraceDialogShown(false);
    }

    function handleNewTraceDialogAccept(traceConfig: GadgetConfiguration) {
        setIsTraceDialogShown(false);
        const gadgetArguments = toGadgetArguments(traceConfig);
        const traceId = props.onRequestTraceId();
        const trace: TraceGadget = { ...traceConfig, traceId, output: null };
        if (isStreamingTrace) {
            vscode.postMessage({ command: "runStreamingTraceRequest", parameters: {arguments: gadgetArguments, traceId} });
        } else {
            vscode.postMessage({ command: "runBlockingTraceRequest", parameters: {arguments: gadgetArguments, traceId} });
        }

        props.userMessageHandlers.onCreateTrace({trace});
        setSelectedTraceId(traceId);

        if (isStreamingTrace) {
            setIsWatching(true);
        }
    }

    function getTraceRowClassNames(traceId?: number): string {
        return selectedTraceId === traceId ? styles.selected : '';
    }

    function handleRowClick(trace: TraceGadget) {
        if (isWatching && isStreamingTrace) {
            vscode.postMessage({ command: "stopStreamingTraceRequest", parameters: undefined });
        }

        const isNewTraceSelected = selectedTraceId !== trace.traceId;

        if (isWatching && isStreamingTrace && isNewTraceSelected) {
            const gadgetArguments = toGadgetArguments(trace);
            vscode.postMessage({ command: "runStreamingTraceRequest", parameters: {arguments: gadgetArguments, traceId: trace.traceId} });
        }

        setSelectedTraceId(isNewTraceSelected ? trace.traceId : null);
    }

    const selectedTrace = props.traces.find(t => t.traceId === selectedTraceId) || null;
    const metadata = selectedTrace && getGadgetMetadata(selectedTrace.category, selectedTrace.resource);

    return (
    <>
        {props.traces.length > 0 && (
            <table className={styles.tracelist}>
                <thead>
                <tr>
                    <th>Gadget</th>
                    <th>Namespace</th>
                    <th>Node</th>
                    <th>Pod</th>
                    <th>Container</th>
                </tr>
                </thead>
                <tbody>
                    {props.traces.map(trace => (
                        <tr key={trace.traceId} onClick={_ => handleRowClick(trace)} className={getTraceRowClassNames(trace.traceId)}>
                            <td>
                                <VSCodeCheckbox checked={checkedTraceIds.includes(trace.traceId)} onClick={ignoreClick} onChange={() => toggleCheckedTraceId(trace.traceId)} style={{margin: "0", paddingRight: "0.5rem"}} />
                                {getGadgetMetadata(trace.category, trace.resource)?.name}
                            </td>
                            <td>{getNamespaceText(trace.filters.namespace)}</td>
                            <td>{trace.filters.nodeName}</td>
                            <td>{trace.filters.podName}</td>
                            <td>{trace.filters.containerName}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}

        <div className={styles.buttonContainer}>
            <VSCodeButton onClick={handleAdd}>
                <FontAwesomeIcon icon={faPlus} />
                &nbsp;Add
            </VSCodeButton>
            {checkedTraceIds.length > 0 && (
                <VSCodeButton onClick={handleDelete}>
                    <FontAwesomeIcon icon={faTrashCan} />
                    &nbsp;Delete
                </VSCodeButton>
            )}
        </div>

        <VSCodeDivider />

        {selectedTrace && (
            <>
                <h3>
                    {isStreamingTrace && <FontAwesomeIcon icon={isWatching ? faEye : faEyeSlash} onClick={() => toggleIsWatching(selectedTrace)} style={{cursor: "pointer", paddingRight: "0.5rem"}} />}
                    {metadata?.name}
                </h3>
                <TraceOutput trace={selectedTrace} />
            </>
        )}

        <NewTraceDialog
            isShown={isNewTraceDialogShown}
            gadgetCategory={props.category}
            nodes={props.nodes}
            resources={props.resources}
            userMessageHandlers={props.userMessageHandlers}
            onCancel={handleNewTraceDialogCancel}
            onAccept={handleNewTraceDialogAccept}
        />
    </>);
}

function getNamespaceText(namespace: NamespaceFilter): string {
    return (
        namespace === NamespaceSelection.Default ? "" :
        namespace === NamespaceSelection.All ? "All" :
        namespace);
}