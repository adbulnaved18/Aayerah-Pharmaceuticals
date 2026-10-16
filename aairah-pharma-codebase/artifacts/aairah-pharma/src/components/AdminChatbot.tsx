import React, { useState } from 'react';
import { UploadCloud, Check, Search, Download, Trash2, Eye, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';

export function AdminChatbotShell({ AdminShellComponent }: { AdminShellComponent: any }) {
  const [documents, setDocuments] = useState([
    { id: 'doc-1', title: 'Returns policy', version: 'v3', state: 'Published', action: 'Replace' },
    { id: 'doc-2', title: 'Delivery guide', version: 'v2', state: 'Ready', action: 'Test' },
    { id: 'doc-3', title: 'Product manual', version: 'v1', state: 'Failed', action: 'Retry' },
  ]);

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'review'>('idle');
  const [testQuestion, setTestQuestion] = useState('');
  const [testAnswer, setTestAnswer] = useState('');

  const handleSimulateTest = (e: React.FormEvent) => {
    e.preventDefault();
    setTestAnswer('This is a simulated answer from the admin playground based on the draft version. The policy states a 7-day return window.');
  };

  return (
    <AdminShellComponent active="chatbot">
      <main className="admin-content">
        <div className="admin-title-row">
          <div>
            <span className="eyebrow">Operations / chatbot</span>
            <h1>Knowledge Base</h1>
            <p>Upload and manage PDFs that the store assistant uses to answer questions.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setUploadState('uploading')}>
            <UploadCloud size={17} /> Upload PDF
          </button>
        </div>

        {uploadState === 'uploading' && (
          <div className="admin-table-card mb-6" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div className="form-card-head mb-4">
              <div className="step-icon"><UploadCloud size={18} /></div>
              <div>
                <h3>Upload PDF Document</h3>
                <p>Provide metadata for retrieval filtering.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <label>
                <span className="field-label">Title</span>
                <input className="field" placeholder="e.g. Returns Policy" />
              </label>
              <label>
                <span className="field-label">Category</span>
                <select className="field">
                  <option>Policies</option>
                  <option>Guides</option>
                  <option>FAQs</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <label>
                <span className="field-label">Audience</span>
                <select className="field">
                  <option>Customer-safe</option>
                  <option>Internal-only</option>
                </select>
              </label>
              <label>
                <span className="field-label">Effective Date</span>
                <input type="date" className="field" />
              </label>
            </div>
            <div 
              className="mb-6"
              style={{
                border: '2px dashed hsl(var(--border))',
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'hsl(var(--card))',
              }}
              onClick={() => setUploadState('review')}
            >
              <UploadCloud size={32} style={{ color: 'hsl(var(--primary))', margin: '0 auto 8px' }} />
              <p><strong>Drag file here or browse</strong></p>
              <p className="text-sm text-gray-500">PDFs only (Max 20 MB / 100 pages)</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => setUploadState('review')}>Process Document</button>
              <button className="btn btn-outline" onClick={() => setUploadState('idle')}>Cancel</button>
            </div>
          </div>
        )}

        {uploadState === 'review' && (
          <div className="admin-table-card mb-6 border-amber-200 bg-amber-50">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-amber-800">Draft Version Review (Delivery guide v3)</h3>
                <p className="text-amber-700 text-sm">Extracted 12 chunks from 4 pages. Ready to test.</p>
              </div>
              <div className="flex gap-2">
                <button className="btn bg-white border border-amber-200 text-amber-900" onClick={() => setUploadState('idle')}>Discard</button>
                <button className="btn bg-amber-600 text-white border-0 hover:bg-amber-700" onClick={() => {
                   setDocuments([{ id: 'doc-4', title: 'Delivery guide', version: 'v3', state: 'Published', action: 'Replace' }, ...documents.filter(d => d.id !== 'doc-2')]);
                   setUploadState('idle');
                }}>Publish to Live</button>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-md border border-amber-100 mb-4">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Eye size={14}/> Extracted Text Preview</h4>
              <p className="text-sm text-gray-600 line-clamp-3">
                [Page 1] Delivery Times and Costs. Standard shipping takes 3-5 business days. Express shipping is available for ₹15 and takes 1-2 business days...
              </p>
            </div>

            <div className="bg-white p-4 rounded-md border border-amber-100">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MessageSquare size={14}/> Admin Playground Test</h4>
              <form onSubmit={handleSimulateTest} className="flex gap-2 mb-4">
                <input 
                  className="field flex-1" 
                  placeholder="Ask a question to test retrieval against this draft..." 
                  value={testQuestion}
                  onChange={(e) => setTestQuestion(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">Test Answer</button>
              </form>
              {testAnswer && (
                <div className="p-3 bg-gray-50 border border-gray-100 rounded text-sm text-gray-800">
                  <div className="font-semibold mb-1 text-teal-700">Bot Answer:</div>
                  {testAnswer}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="admin-table-card">
          <div className="table-toolbar">
            <div>
              <h3>Document State</h3>
              <p>Active and processing knowledge sources.</p>
            </div>
            <div className="admin-search">
              <Search size={17} />
              <input placeholder="Search documents..." />
            </div>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Version</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.title}</strong></td>
                    <td className="mono">{doc.version}</td>
                    <td>
                      <span className={`status ${doc.state === 'Published' ? 'success' : doc.state === 'Failed' ? 'danger' : 'warning'}`}>
                        <span />{doc.state}
                      </span>
                    </td>
                    <td>
                      <button className="text-sm font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1">
                        {doc.action === 'Replace' && <RefreshCw size={14} />}
                        {doc.action === 'Test' && <Eye size={14} />}
                        {doc.action === 'Retry' && <RefreshCw size={14} />}
                        {doc.action}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </AdminShellComponent>
  );
}
