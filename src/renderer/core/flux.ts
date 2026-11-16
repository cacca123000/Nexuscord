/*
 * Flux Dispatcher bridge.
 *  - subscribe(type, cb): listen to Discord actions (MESSAGE_DELETE, CHANNEL_SELECT, ...)
 *  - intercept(cb): inspect/mutate every action before stores see it; return
 *    `true` to swallow the action entirely.
 */
import { Logger } from "./logger";
import { Patcher } from "./patcher";
import { filters, waitFor } from "./webpack";

const log = new Logger("Flux");

export interface FluxAction {
    type: string;
    [key: string]: any;
}

export type Interceptor = (action: FluxAction) => boolean | void;
type Listener = (action: FluxAction) => void;

export let Dispatcher: any;
const interceptors = new Set<{ owner: string; fn: Interceptor }>();
const pendingSubs: [string, Listener][] = [];
const readyCbs: ((d: any) => void)[] = [];

function runInterceptors(action: FluxAction): boolean {
    if (!action || typeof action.type !== "string") return false;
    for (const i of interceptors) {
        try {
            if (i.fn(action) === true) return true;
        } catch (e) {
            log.error(`Interceptor from ${i.owner} threw on ${action.type}`, e);
        }
    }
    return false;
}

export function initFlux(): void {
    waitFor(
        m =>
            filters.byProps("dispatch", "subscribe", "unsubscribe")(m) &&
            (typeof m._dispatch === "function" || "_actionHandlers" in m || typeof m.isDispatching === "function"),
        d => {
            if (Dispatcher) return;
            Dispatcher = d;
            const method = typeof d._dispatch === "function" ? "_dispatch" : "dispatch";
            Patcher.instead("NexusCord:Flux", d, method, (self, args, original) => {
                if (interceptors.size && runInterceptors(args[0])) {
                    return method === "dispatch" ? Promise.resolve() : undefined;
                }
                return original.apply(self, args);
            });
            for (const [type, cb] of pendingSubs.splice(0)) d.subscribe(type, cb);
            for (const cb of readyCbs.splice(0)) cb(d);
            log.info(`Dispatcher hooked via ${method}`);
        },
        "flux"
    );
}

export function onDispatcherReady(cb: (d: any) => void) {
    if (Dispatcher) cb(Dispatcher);
    else readyCbs.push(cb);
}

/** Subscribe to a Flux action type. Returns an unsubscribe function. */
export function subscribe(type: string, cb: Listener): () => void {
    const safe: Listener = action => {
        try {
            cb(action);
        } catch (e) {
            log.error(`Subscriber for ${type} threw`, e);
        }
    };
    if (Dispatcher) Dispatcher.subscribe(type, safe);
    else pendingSubs.push([type, safe]);
    return () => {
        const i = pendingSubs.findIndex(p => p[1] === safe);
        if (i !== -1) pendingSubs.splice(i, 1);
        else Dispatcher?.unsubscribe(type, safe);
    };
}

export function intercept(owner: string, fn: Interceptor): () => void {
    const entry = { owner, fn };
    interceptors.add(entry);
    return () => interceptors.delete(entry);
}

export function dispatch(action: FluxAction): Promise<void> | undefined {
    return Dispatcher?.dispatch(action);
}

export const Flux = { subscribe, intercept, dispatch, onDispatcherReady, get Dispatcher() { return Dispatcher; } };
