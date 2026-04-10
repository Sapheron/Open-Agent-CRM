'use client';

/**
 * Leads → API Docs page.
 *
 * Detailed API documentation for the Leads endpoints with cURL examples.
 */

import { useState } from 'react';
import { Copy, Check, BookOpen, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function LeadsApiDocsPage() {
  const apiBaseUrl = window.location.origin + '/api';
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyCommand = (cmd: string, id: string) => {
    void navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 1500);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-2 shrink-0 bg-white">
        <BookOpen size={14} className="text-violet-500" />
        <span className="text-xs font-semibold text-gray-900">Leads — API Documentation</span>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/50">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Overview */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Leads API</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              RESTful API for managing leads in your CRM. All endpoints require authentication via
              either a session cookie (dashboard) or an API key (external integrations).
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <span className="bg-gray-100 px-2 py-0.5 rounded">Base URL: {apiBaseUrl}</span>
            </div>
          </div>

          {/* Authentication */}
          <AuthSection />

          {/* Endpoints */}
          <EndpointSection
            title="List Leads"
            method="GET"
            path="/leads"
            description="Retrieve all leads with optional filtering. Returns paginated results."
            queryParams={[
              { name: 'status', type: 'string', desc: 'Filter by status (NEW, CONTACTED, QUALIFIED, etc.)' },
              { name: 'source', type: 'string', desc: 'Filter by source (WHATSAPP, WEBSITE, META_ADS, etc.)' },
              { name: 'priority', type: 'string', desc: 'Filter by priority (LOW, MEDIUM, HIGH, URGENT)' },
              { name: 'assignedAgentId', type: 'string', desc: 'Filter by assigned agent (use "null" for unassigned)' },
              { name: 'tag', type: 'string', desc: 'Filter by tag' },
              { name: 'search', type: 'string', desc: 'Search in title, contact name, or phone' },
              { name: 'sort', type: 'string', desc: 'Sort order (recent, score, value, due)' },
              { name: 'page', type: 'number', desc: 'Page number (default: 1)' },
              { name: 'limit', type: 'number', desc: 'Items per page (default: 50, max: 200)' },
            ]}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="list-leads"
              code={`curl -X GET "${apiBaseUrl}/leads?page=1&limit=20&status=NEW" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY"`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Get Single Lead"
            method="GET"
            path="/leads/:id"
            description="Retrieve full details of a specific lead including timeline."
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="get-lead"
              code={`curl -X GET "${apiBaseUrl}/leads/LEAD_ID" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY"`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Create Lead"
            method="POST"
            path="/leads"
            description="Create a new lead. Auto-creates a contact if phoneNumber is provided and no existing contact matches."
            requestBody={`
{
  "title": "Inbound from website form",
  "contactId": "contact_123",  // optional: use existing contact
  "phoneNumber": "+919876543210",  // alternative: creates new contact
  "contactName": "John Doe",
  "email": "john@example.com",
  "source": "WEBSITE",
  "status": "NEW",
  "priority": "HIGH",
  "estimatedValue": 50000,
  "currency": "INR",
  "tags": ["inbound", "q1-2025"],
  "expectedCloseAt": "2025-03-31T23:59:59Z",
  "customFields": { "utm_source": "google", "campaign": "spring_sale" }
}`}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="create-lead"
              code={`curl -X POST "${apiBaseUrl}/leads" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Inbound from website",
    "phoneNumber": "+919876543210",
    "contactName": "Jane Doe",
    "email": "jane@example.com",
    "source": "WEBHOOK",
    "priority": "HIGH",
    "estimatedValue": 25000,
    "tags": ["tally", "homepage"]
  }'`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Update Lead"
            method="PATCH"
            path="/leads/:id"
            description="Partial update of lead fields. Only provided fields are updated."
            requestBody={`
{
  "title": "Updated title",
  "status": "QUALIFIED",
  "priority": "URGENT",
  "estimatedValue": 75000,
  "tags": ["hot-lead", "q2-2025"],
  "expectedCloseAt": "2025-06-30T23:59:59Z"
}`}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="update-lead"
              code={`curl -X PATCH "${apiBaseUrl}/leads/LEAD_ID" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "QUALIFIED",
    "priority": "HIGH",
    "estimatedValue": 75000
  }'`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Update Lead Status"
            method="POST"
            path="/leads/:id/status"
            description="Update lead status with optional reason. Logs activity."
            requestBody={`{
  "status": "WON",
  "reason": "Closed deal - paid 50% advance"
}`}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="update-status"
              code={`curl -X POST "${apiBaseUrl}/leads/LEAD_ID/status" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "QUALIFIED",
    "reason": "Demo went well, budget confirmed"
  }'`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Assign Lead"
            method="POST"
            path="/leads/:id/assign"
            description="Assign or unassign a lead to an agent."
            requestBody={`{
  "userId": "agent_123"  // or null to unassign
}`}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="assign-lead"
              code={`curl -X POST "${apiBaseUrl}/leads/LEAD_ID/assign" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "AGENT_USER_ID"
  }'`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Add Note"
            method="POST"
            path="/leads/:id/notes"
            description="Add a text note to the lead timeline."
            requestBody={`{
  "body": "Called customer, interested in demo"
}`}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="add-note"
              code={`curl -X POST "${apiBaseUrl}/leads/LEAD_ID/notes" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "body": "Followed up via WhatsApp, sent pricing"
  }'`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Get Stats"
            method="GET"
            path="/leads/stats"
            description="Get aggregate statistics for leads."
            queryParams={[
              { name: 'days', type: 'number', desc: 'Lookback period in days (default: 30)' },
            ]}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="get-stats"
              code={`curl -X GET "${apiBaseUrl}/leads/stats?days=30" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY"`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Bulk Update Status"
            method="POST"
            path="/leads/bulk/status"
            description="Update status for multiple leads at once."
            requestBody={`{
  "ids": ["lead_1", "lead_2", "lead_3"],
  "status": "CONTACTED",
  "reason": "Bulk outreach campaign"
}`}
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="bulk-status"
              code={`curl -X POST "${apiBaseUrl}/leads/bulk/status" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "ids": ["lead_1", "lead_2"],
    "status": "QUALIFIED",
    "reason": "Qualified via phone screening"
  }'`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          <EndpointSection
            title="Delete Lead"
            method="DELETE"
            path="/leads/:id"
            description="Permanently delete a lead."
            copyCommand={copyCommand}
            copiedCmd={copiedCmd}
            apiBaseUrl={apiBaseUrl}
          >
            <CodeBlock
              id="delete-lead"
              code={`curl -X DELETE "${apiBaseUrl}/leads/LEAD_ID" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY"`}
              copyCommand={copyCommand}
              copiedCmd={copiedCmd}
            />
          </EndpointSection>

          {/* Enums Reference */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Field Enum Values</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EnumField
                name="status"
                values={['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST', 'DISQUALIFIED']}
              />
              <EnumField
                name="source"
                values={['WHATSAPP', 'WEBSITE', 'REFERRAL', 'INBOUND_EMAIL', 'OUTBOUND', 'CAMPAIGN', 'FORM', 'IMPORT', 'AI_CHAT', 'MANUAL', 'META_ADS', 'WEBHOOK', 'OTHER']}
              />
              <EnumField
                name="priority"
                values={['LOW', 'MEDIUM', 'HIGH', 'URGENT']}
              />
              <EnumField
                name="currency"
                values={['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'AED', 'SAR', 'MYR']}
              />
            </div>
          </div>

          {/* Custom Webhook */}
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <BookOpen size={16} className="text-violet-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-violet-900 mb-1">Custom Webhook</h3>
                <p className="text-xs text-violet-700 leading-relaxed mb-2">
                  For simple lead ingestion from any external source, use the custom webhook endpoint.
                  Generate an API key with the <code className="bg-violet-100 px-1 rounded">leads:write</code> scope
                  in <Link href="/leads/integrations" className="underline">Leads → Integrations</Link>.
                </p>
                <CodeBlock
                  id="webhook"
                  code={`curl -X POST "${apiBaseUrl}/webhooks/leads/custom" \\
  -H "Authorization: Bearer wacrm_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "External form submission",
    "phoneNumber": "+919876543210",
    "contactName": "John Doe",
    "estimatedValue": 25000
  }'`}
                  copyCommand={copyCommand}
                  copiedCmd={copiedCmd}
                />
              </div>
            </div>
          </div>

          {/* OpenAPI Link */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700">Full OpenAPI/Swagger documentation</p>
              <p className="text-[10px] text-gray-400">Interactive API explorer with all endpoints</p>
            </div>
            <a
              href={`${apiBaseUrl}/docs`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-violet-600 hover:text-violet-700 flex items-center gap-1"
            >
              Open Docs <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthSection() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Authentication</h2>
      <div className="space-y-3 text-xs text-gray-600">
        <div>
          <p className="font-medium text-gray-700 mb-1">API Key (Recommended for integrations)</p>
          <p className="text-gray-500">
            Include in the <code className="bg-gray-100 px-1 rounded">Authorization</code> header:
          </p>
          <code className="block bg-gray-50 border border-gray-200 rounded px-2 py-1.5 mt-1 text-[10px]">
            Authorization: Bearer wacrm_&lt;your-api-key&gt;
          </code>
        </div>
        <div>
          <p className="font-medium text-gray-700 mb-1">Session Cookie (Dashboard)</p>
          <p className="text-gray-500">
            When calling from the browser, the session cookie is sent automatically with each request.
          </p>
        </div>
      </div>
    </div>
  );
}

function EndpointSection({
  title: _title,
  method,
  path,
  description,
  queryParams,
  requestBody,
  children,
  copyCommand: _copyCommand,
  copiedCmd: _copiedCmd,
  apiBaseUrl: _apiBaseUrl,
}: {
  title: string;
  method: string;
  path: string;
  description: string;
  queryParams?: Array<{ name: string; type: string; desc: string }>;
  requestBody?: string;
  children?: React.ReactNode;
  copyCommand: (cmd: string, id: string) => void;
  copiedCmd: string | null;
  apiBaseUrl: string;
}) {
  const methodColors: Record<string, string> = {
    GET: 'bg-emerald-100 text-emerald-700',
    POST: 'bg-blue-100 text-blue-700',
    PATCH: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-red-100 text-red-700',
    PUT: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${methodColors[method] || 'bg-gray-100 text-gray-700'}`}>
            {method}
          </span>
          <code className="text-sm text-gray-900">{path}</code>
        </div>
      </div>
      <p className="text-xs text-gray-600 mb-3">{description}</p>

      {queryParams && queryParams.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Query Parameters</p>
          <div className="bg-gray-50 rounded p-2 space-y-1">
            {queryParams.map((param) => (
              <div key={param.name} className="flex gap-2 text-[10px]">
                <code className="text-violet-600 min-w-[80px]">{param.name}</code>
                <span className="text-gray-400">({param.type})</span>
                <span className="text-gray-600">{param.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {requestBody && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Request Body</p>
          <pre className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-[10px] text-gray-700 overflow-x-auto">
            {requestBody}
          </pre>
        </div>
      )}

      {children}
    </div>
  );
}

function CodeBlock({
  id,
  code,
  copyCommand,
  copiedCmd,
}: {
  id: string;
  code: string;
  copyCommand: (cmd: string, id: string) => void;
  copiedCmd: string | null;
}) {
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded-lg px-3 py-3 text-[10px] overflow-x-auto">
        {code}
      </pre>
      <button
        onClick={() => copyCommand(code, id)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 hover:bg-gray-600 text-white p-1.5 rounded"
      >
        {copiedCmd === id ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function EnumField({ name, values }: { name: string; values: string[] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{name}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <code key={v} className="text-[9px] bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded text-gray-700">
            {v}
          </code>
        ))}
      </div>
    </div>
  );
}
