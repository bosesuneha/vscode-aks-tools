import { Command, MessageDefinition, MessageHandler } from "../../../src/webview-contract/messaging";

/**
 * The type used to define handlers for messages that change the state of a component
 * when using a reducer (https://react.dev/reference/react/useReducer).
 */
export type StateMessageHandler<TMsgDef extends MessageDefinition, TState> = {
    [P in Command<TMsgDef>]: (state: TState, msg: TMsgDef[P]) => TState
};

/**
 * The type of the 'action' in the reducer.
 */
export type StateMessage = {
    command: string,
    args?: any
};

/**
 * A reducer type that uses the `StateMessage` action. This is a function that applies an action
 * to a state to return another state.
 */
export type StateUpdater<TState> = React.Reducer<TState, StateMessage>;

/**
 * Takes a message handler for updating state and creates a reducer that can be used in the
 * `useReducer` function.
 */
export function toStateUpdater<TMsgDef extends MessageDefinition, TState>(handler: StateMessageHandler<TMsgDef, TState>): StateUpdater<TState> {
    return (state, msg) => {
        if (msg.command in handler) {
            return handler[msg.command](state, msg.args);
        }

        return state;
    }
}

/**
 * Allows multiple reducers to be combined into a single one (used when processing different types of message).
 */
export function chainStateUpdaters<TState>(...stateUpdaters: StateUpdater<TState>[]): StateUpdater<TState> {
    return stateUpdaters.reduce((prev, curr) => {
        return (state, msg) => curr(prev(state, msg), msg);
    }, state => state);
}

/**
 * An event handler type for a particular kind of message. Each command in the message definition is prefixed
 * with `on`.
 */
export type EventHandlers<TMsgDef extends MessageDefinition> = {
    [P in Command<TMsgDef> as `on${Capitalize<P>}`]: (args: TMsgDef[P]) => void
};

/**
 * Any object containing all the keys (commands) for a message definition.
 */
export type CommandKeys<TMsgDef> = {
    [P in Command<TMsgDef>]: any
};

/**
 * Creates event handlers for a message definition which forward calls to the `dispatch` function
 * (https://react.dev/reference/react/useReducer#dispatch)
 */
export function getEventHandlers<TMsgDef extends MessageDefinition>(dispatch: React.Dispatch<StateMessage>, keys: CommandKeys<TMsgDef>): EventHandlers<TMsgDef> {
    const entries = Object.keys(keys).map(command => [asEvent(command), (args: any) => dispatch({command: command, args})]);
    return Object.fromEntries(entries);
}

function asEvent(str: string) {
    return "on" + str[0].toUpperCase() + str.slice(1);
}

/**
 * Creates a handler for a message definition which can be used by a message subscriber, and which
 * forwards invocations to the `dispatch` function.
 */
export function getMessageHandler<TMsgDef extends MessageDefinition>(dispatch: React.Dispatch<StateMessage>, keys: CommandKeys<TMsgDef>): MessageHandler<TMsgDef> {
    const entries = Object.keys(keys).map(command => [command, (args: any) => dispatch({command: command, args})]);
    return Object.fromEntries(entries);
}