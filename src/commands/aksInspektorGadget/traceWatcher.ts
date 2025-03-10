import * as vscode from 'vscode';
import { Errorable, failed, map as errmap } from '../utils/errorable';
import { Observable, Subscription, filter, map as rxmap } from 'rxjs';
import { ClusterOperations } from './clusterOperations';
import { asFlatItems, parseOutputLine } from './traceItems';
import { OutputStream } from '../utils/commands';
import { GadgetArguments, TraceOutputItem } from '../../webview-contract/webviewDefinitions/inspektorGadget';

export class TraceWatcher extends vscode.Disposable {
    private _currentTraceOutput: TraceOutput | null = null;
    private _outputItemsSubscription: Subscription | null = null;

    constructor(
        readonly clusterOperations: ClusterOperations,
        readonly clusterName: string
    ) {
        super(() => {
            this.stopWatching();
        })
    }

    async watch(
        gadgetArgs: GadgetArguments,
        outputItemsHandler: (items: TraceOutputItem[]) => void,
        errorHandler: (e: Error) => {}
    ): Promise<Errorable<void>> {
        this.stopWatching();

        const outputStream = await this.clusterOperations.watchTrace(gadgetArgs);
        const output = errmap(outputStream, stream => new TraceOutput(stream));
        if (failed(output)) {
            return output;
        }

        this._currentTraceOutput = output.result;
        this._outputItemsSubscription = output.result.outputItems.subscribe({ next: outputItemsHandler, error: errorHandler });

        return { succeeded: true, result: undefined };
    }

    stopWatching() {
        this._currentTraceOutput?.dispose();
        this._currentTraceOutput = null;
        this._outputItemsSubscription?.unsubscribe();
        this._outputItemsSubscription = null;
    }
}

class TraceOutput extends vscode.Disposable {
    constructor(
        readonly source: OutputStream
    ) {
        super(() => {
            this.source.dispose();
        });

        this.outputItems = this.source.lines.pipe(filter(line => !!line)).pipe(rxmap(line => this._outputLineToObjects(line)));
    }

    readonly outputItems: Observable<TraceOutputItem[]>;

    private _outputLineToObjects(line: string): object[] {
        const items = parseOutputLine(line);
        if (failed(items)) {
            throw new Error(`Unable to read streaming trace output: ${items.error}`);
        }

        return items.result.flatMap(asFlatItems);
    }
}
