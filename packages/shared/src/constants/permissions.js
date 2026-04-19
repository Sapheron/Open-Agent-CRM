"use strict";
/**
 * RBAC Permissions — feature-level access control.
 *
 * ADMIN / SUPER_ADMIN bypass all permission checks.
 * AGENT (Staff) users only have access to features listed in their
 * `permissions` String[] field on the User model.
 *
 * Each permission corresponds to a sidebar feature / module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_PERMISSIONS = exports.PERMISSION_GROUPS = exports.PERMISSION_LABELS = exports.ALL_PERMISSIONS = exports.PERMISSIONS = void 0;
exports.getToolPermission = getToolPermission;
exports.hasPermission = hasPermission;
exports.canAccessRoute = canAccessRoute;
// ── Permission keys (one per feature) ────────────────────────────────────────
exports.PERMISSIONS = {
    AI_CHAT: 'ai_chat',
    MEMORY: 'memory',
    CONTACTS: 'contacts',
    LEADS: 'leads',
    DEALS: 'deals',
    TASKS: 'tasks',
    PRODUCTS: 'products',
    BROADCASTS: 'broadcasts',
    TEMPLATES: 'templates',
    SEQUENCES: 'sequences',
    CAMPAIGNS: 'campaigns',
    FORMS: 'forms',
    QUOTES: 'quotes',
    INVOICES: 'invoices',
    PAYMENTS: 'payments',
    TICKETS: 'tickets',
    KB: 'kb',
    WORKFLOWS: 'workflows',
    ANALYTICS: 'analytics',
    REPORTS: 'reports',
    DOCUMENTS: 'documents',
    INTEGRATIONS: 'integrations',
    SETTINGS: 'settings',
    TEAM: 'team',
    WHATSAPP: 'whatsapp',
};
/** All permission keys as an array — used for "select all" in the UI. */
exports.ALL_PERMISSIONS = Object.values(exports.PERMISSIONS);
/** Human-readable labels for the permission matrix UI. */
exports.PERMISSION_LABELS = {
    ai_chat: 'AI Chat',
    memory: 'Memory',
    contacts: 'Contacts',
    leads: 'Leads',
    deals: 'Deals',
    tasks: 'Tasks',
    products: 'Products',
    broadcasts: 'Broadcasts',
    templates: 'Templates',
    sequences: 'Sequences',
    campaigns: 'Campaigns',
    forms: 'Forms',
    quotes: 'Quotes',
    invoices: 'Invoices',
    payments: 'Payments',
    tickets: 'Tickets',
    kb: 'Knowledge Base',
    workflows: 'Workflows',
    analytics: 'Analytics',
    reports: 'Reports',
    documents: 'Documents',
    integrations: 'Integrations',
    settings: 'Settings',
    team: 'Team Management',
    whatsapp: 'WhatsApp',
};
/** Group permissions by sidebar section — for the UI. */
exports.PERMISSION_GROUPS = [
    {
        label: 'AI',
        permissions: ['ai_chat', 'memory'],
    },
    {
        label: 'CRM',
        permissions: ['contacts', 'leads', 'deals', 'tasks', 'products'],
    },
    {
        label: 'Engage',
        permissions: ['broadcasts', 'templates', 'sequences', 'campaigns', 'forms'],
    },
    {
        label: 'Sales',
        permissions: ['quotes', 'invoices', 'payments'],
    },
    {
        label: 'Support',
        permissions: ['tickets', 'kb'],
    },
    {
        label: 'Automate',
        permissions: ['workflows'],
    },
    {
        label: 'Insights',
        permissions: ['analytics', 'reports'],
    },
    {
        label: 'More',
        permissions: ['documents', 'integrations'],
    },
    {
        label: 'Admin',
        permissions: ['settings', 'team', 'whatsapp'],
    },
];
// ── AI tool → permission mapping ─────────────────────────────────────────────
// Maps tool name prefixes / patterns to the permission required to use them.
// Used by the AI chat service to filter tool definitions and block execution
// for users without the corresponding permission.
function getToolPermission(toolName) {
    if (/^memory_/.test(toolName))
        return 'memory';
    if (/^send_whatsapp|^list_conversations/.test(toolName))
        return 'whatsapp';
    if (/broadcast/.test(toolName))
        return 'broadcasts';
    if (/^get_analytics/.test(toolName))
        return 'analytics';
    if (/contact/.test(toolName))
        return 'contacts';
    if (/lead/.test(toolName))
        return 'leads';
    if (/deal/.test(toolName))
        return 'deals';
    if (/task/.test(toolName))
        return 'tasks';
    if (/template/.test(toolName))
        return 'templates';
    if (/sequence|enroll/.test(toolName))
        return 'sequences';
    if (/pipeline/.test(toolName))
        return 'deals';
    if (/product|stock/.test(toolName))
        return 'products';
    if (/quote/.test(toolName))
        return 'quotes';
    if (/invoice/.test(toolName))
        return 'invoices';
    if (/payment/.test(toolName))
        return 'payments';
    if (/campaign/.test(toolName))
        return 'campaigns';
    if (/form|submission/.test(toolName))
        return 'forms';
    if (/workflow/.test(toolName))
        return 'workflows';
    if (/ticket/.test(toolName))
        return 'tickets';
    if (/knowledge_base|^kb_|knowledgebase|^search_knowledge/.test(toolName))
        return 'kb';
    if (/report/.test(toolName))
        return 'reports';
    if (/calendar|event/.test(toolName))
        return 'tasks';
    if (/document/.test(toolName))
        return 'documents';
    return null; // unknown tools — allow by default (admin-only tools)
}
// ── Sidebar route → permission mapping ───────────────────────────────────────
// Used by the dashboard to filter sidebar items and gate routes.
exports.ROUTE_PERMISSIONS = {
    '/chat': 'ai_chat',
    '/memory': 'memory',
    '/docs': 'ai_chat',
    '/contacts': 'contacts',
    '/leads': 'leads',
    '/deals': 'deals',
    '/tasks': 'tasks',
    '/products': 'products',
    '/broadcasts': 'broadcasts',
    '/templates': 'templates',
    '/sequences': 'sequences',
    '/campaigns': 'campaigns',
    '/forms': 'forms',
    '/quotes': 'quotes',
    '/invoices': 'invoices',
    '/payments': 'payments',
    '/tickets': 'tickets',
    '/kb': 'kb',
    '/workflows': 'workflows',
    '/analytics': 'analytics',
    '/reports': 'reports',
    '/documents': 'documents',
    '/integrations': 'integrations',
    '/settings': 'settings',
};
// ── Helper: check if a user has a permission ─────────────────────────────────
function hasPermission(userRole, userPermissions, required) {
    // Admins bypass all permission checks
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN')
        return true;
    return userPermissions.includes(required);
}
/** Check if a user can access a given route path. */
function canAccessRoute(userRole, userPermissions, path) {
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN')
        return true;
    // Find the matching route prefix
    const match = Object.entries(exports.ROUTE_PERMISSIONS).find(([route]) => path === route || path.startsWith(route + '/'));
    if (!match)
        return true; // unknown routes are open
    return userPermissions.includes(match[1]);
}
//# sourceMappingURL=permissions.js.map