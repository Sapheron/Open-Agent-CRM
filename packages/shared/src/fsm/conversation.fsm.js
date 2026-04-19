"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitionFsm = transitionFsm;
exports.validEvents = validEvents;
const TRANSITIONS = [
    { from: 'OPEN', event: 'message_received', to: 'AI_HANDLING' },
    { from: 'AI_HANDLING', event: 'ai_replied', to: 'AI_HANDLING' }, // loop
    { from: 'AI_HANDLING', event: 'escalate_requested', to: 'WAITING_HUMAN' },
    { from: 'AI_HANDLING', event: 'error_limit_reached', to: 'WAITING_HUMAN' },
    { from: 'WAITING_HUMAN', event: 'agent_claimed', to: 'HUMAN_HANDLING' },
    { from: 'HUMAN_HANDLING', event: 'agent_resolved', to: 'RESOLVED' },
    { from: 'RESOLVED', event: 'new_message_on_resolved', to: 'AI_HANDLING' },
    { from: 'RESOLVED', event: 'idle_7_days', to: 'CLOSED' },
    {
        from: ['OPEN', 'AI_HANDLING', 'WAITING_HUMAN', 'HUMAN_HANDLING', 'RESOLVED'],
        event: 'mark_spam',
        to: 'SPAM',
    },
];
/**
 * Returns the next state given the current state and event.
 * Returns null if the transition is not valid (caller decides how to handle).
 */
function transitionFsm(current, event) {
    for (const t of TRANSITIONS) {
        const from = Array.isArray(t.from) ? t.from : [t.from];
        if (from.includes(current) && t.event === event) {
            return t.to;
        }
    }
    return null;
}
/** Returns all valid events from a given state. */
function validEvents(state) {
    return TRANSITIONS.filter((t) => {
        const from = Array.isArray(t.from) ? t.from : [t.from];
        return from.includes(state);
    }).map((t) => t.event);
}
//# sourceMappingURL=conversation.fsm.js.map