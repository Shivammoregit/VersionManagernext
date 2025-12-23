"use client";

import React, { useState, useEffect } from 'react';

// ================= CONSTANTS =================
const APP_DEFS = {
    'ios-parent': { name: 'Parent App', platform: 'ios', type: 'Parent' },
    'ios-partner': { name: 'Partner App', platform: 'ios', type: 'Partner' },
    'android-parent': { name: 'Parent App', platform: 'android', type: 'Parent' },
    'android-partner': { name: 'Partner App', platform: 'android', type: 'Partner' }
};

const formatDate = (d) => {
    return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
};

export default function Home() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [activeTab, setActiveTab] = useState('current');
    const [releases, setReleases] = useState([]);
    const [appsData, setAppsData] = useState({});
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    // Modal States
    const [showAddModal, setShowAddModal] = useState(false);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [modalData, setModalData] = useState(null);

    const [formData, setFormData] = useState({
        id: '',
        appId: 'ios-parent',
        environment: 'production',
        version: '',
        build: '',
        notes: '',
        isBreaking: false
    });

    useEffect(() => {
        if (typeof window !== 'undefined' && sessionStorage.getItem('vm_auth') === 'true') {
            setIsAuthenticated(true);
            loadData();
        }
    }, []);

    const showToast = (msg, type) => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/releases');
            const data = await res.json();
            if(Array.isArray(data)) {
                setReleases(data);
                processAppsData(data);
            }
        } catch (err) {
            showToast('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const processAppsData = (releasesData) => {
        const processed = {};
        Object.keys(APP_DEFS).forEach(appId => {
            const def = APP_DEFS[appId];
            const prod = releasesData.find(r => r.app_id === appId && r.environment === 'production');
            const dev = releasesData.find(r => r.app_id === appId && r.environment === 'development');

            processed[appId] = {
                ...def,
                production: prod || { version: '—', build: '—', date: null, notes: '', breaking: false },
                development: dev || { version: '—', build: '—', date: null, notes: '', breaking: false }
            };
        });
        setAppsData(processed);
    };

    const handleSave = async () => {
        try {
            const url = formData.id ? `/api/releases/${formData.id}` : '/api/releases';
            const method = formData.id ? 'PUT' : 'POST';
            
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_id: formData.appId,
                    version: formData.version,
                    build: formData.build,
                    environment: formData.environment,
                    notes: formData.notes,
                    is_breaking: formData.isBreaking
                })
            });

            if (res.ok) {
                showToast('Saved!', 'success');
                setShowAddModal(false);
                loadData();
            } else {
                showToast('Error saving', 'error');
            }
        } catch (err) {
            showToast('Connection error', 'error');
        }
    };

    if (!isAuthenticated) {
        return <AuthScreen onLogin={() => { setIsAuthenticated(true); loadData(); }} />;
    }

    return (
        <div className="container">
            <header>
                <h1><span className="status-dot connected"></span>Version Manager</h1>
                <button className="btn btn-sm" onClick={() => {
                    sessionStorage.removeItem('vm_auth');
                    setIsAuthenticated(false);
                }}>Logout</button>
            </header>

            <div className="tabs">
                {['current', 'history', 'breaking'].map(tab => (
                    <button key={tab} 
                        className={`tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {activeTab === 'current' && (
                <div className="tab-content">
                    {loading ? <div className="loading">Loading...</div> : (
                        <div className="app-grid">
                            {Object.entries(appsData).map(([id, app]) => (
                                <AppCard key={id} id={id} app={app} 
                                    onEdit={(env) => {
                                        const v = app[env];
                                        setFormData({
                                            id: v._id || '', 
                                            appId: id, environment: env, 
                                            version: v.version !== '—' ? v.version : '', 
                                            build: v.build !== '—' ? v.build : '',
                                            notes: v.notes || '', isBreaking: v.breaking || false
                                        });
                                        setShowAddModal(true);
                                    }}
                                    onNotes={(env) => {
                                        setModalData({ title: `${app.name} (${env})`, content: app[env].notes });
                                        setShowNotesModal(true);
                                    }}
                                />
                            ))}
                        </div>
                    )}
                    <div className="add-release-container">
                        <button className="btn btn-primary btn-full" onClick={() => {
                            setFormData({ id: '', appId: 'ios-parent', environment: 'production', version: '', build: '', notes: '', isBreaking: false });
                            setShowAddModal(true);
                        }}>+ Add Release</button>
                    </div>
                </div>
            )}

            {(activeTab === 'history' || activeTab === 'breaking') && (
                <HistoryList 
                    releases={activeTab === 'breaking' ? releases.filter(r => r.is_breaking) : releases} 
                />
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <span className="modal-title">{formData.id ? 'Edit' : 'Add'} Release</span>
                            <button className="modal-close" onClick={() => setShowAddModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">App</label>
                                    <select className="form-select" value={formData.appId} disabled={!!formData.id} 
                                        onChange={e => setFormData({...formData, appId: e.target.value})}>
                                        {Object.entries(APP_DEFS).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.platform})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Env</label>
                                    <select className="form-select" value={formData.environment} disabled={!!formData.id}
                                        onChange={e => setFormData({...formData, environment: e.target.value})}>
                                        <option value="production">Production</option>
                                        <option value="development">Development</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Version</label>
                                    <input className="form-input" value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Build</label>
                                    <input className="form-input" value={formData.build} onChange={e => setFormData({...formData, build: e.target.value})} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-checkbox">
                                    <input type="checkbox" checked={formData.isBreaking} onChange={e => setFormData({...formData, isBreaking: e.target.checked})} />
                                    <span>Breaking Change</span>
                                </label>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-textarea" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn" onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notes Modal */}
            {showNotesModal && (
                <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowNotesModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <span className="modal-title">{modalData?.title}</span>
                            <button className="modal-close" onClick={() => setShowNotesModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: '#737373', lineHeight: 1.6 }}>{modalData?.content || 'No notes'}</p>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}

// Sub-components
function AuthScreen({ onLogin }) {
    const [pass, setPass] = useState('');
    const [err, setErr] = useState('');
    
    const login = async () => {
        try {
            const res = await fetch('/api/auth', { 
                method: 'POST', 
                body: JSON.stringify({ passkey: pass }) 
            });
            const data = await res.json();
            if (data.success) {
                sessionStorage.setItem('vm_auth', 'true');
                onLogin();
            } else setErr('Invalid passkey');
        } catch(e) { setErr('Connection error'); }
    };

    return (
        <div className="passkey-overlay">
            <h2 className="pass">Enter Passkey</h2>
            <div className="passkey-box">
                <input type="password" placeholder="Passkey" value={pass} 
                    onChange={e => setPass(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && login()} />
                <button onClick={login}>→</button>
            </div>
            <div className="passkey-error">{err}</div>
        </div>
    );
}

function AppCard({ id, app, onEdit, onNotes }) {
    return (
        <div className="app-card">
            <div className="app-header">
                <span className={`platform-dot ${app.platform}`}></span>
                <span className="app-name">{app.platform.toUpperCase()} {app.name}</span>
            </div>
            <div className="versions">
                <VersionBlock label="Prod" data={app.production} onEdit={() => onEdit('production')} onNotes={() => onNotes('production')} />
                <VersionBlock label="Dev" data={app.development} onEdit={() => onEdit('development')} onNotes={() => onNotes('development')} />
            </div>
        </div>
    );
}

function VersionBlock({ label, data, onEdit, onNotes }) {
    return (
        <div className="version-block">
            <label>{label}</label>
            <div className="version-number">
                {data.version}
                {data.breaking && <span className="badge breaking">!</span>}
            </div>
            <div className="version-meta">{data.build} {data.date && `· ${formatDate(data.date)}`}</div>
            <div className="version-actions">
                <button className="btn btn-sm" onClick={onNotes}>Notes</button>
                <button className="btn btn-sm" onClick={onEdit}>Edit</button>
            </div>
        </div>
    );
}

function HistoryList({ releases }) {
    return (
        <div className="history-list">
            {releases.length === 0 ? <div className="empty">No Data</div> : releases.map(r => (
                <div key={r._id} className="history-row">
                    <div className="app-cell">
                        <span className={`platform-dot ${APP_DEFS[r.app_id]?.platform || 'ios'}`}></span>
                        {APP_DEFS[r.app_id]?.name || r.app_id}
                    </div>
                    <div className="version-cell">{r.version}</div>
                    <div className={`env-badge ${r.environment === 'production' ? 'prod' : 'dev'}`}>
                        {r.environment === 'production' ? 'Prod' : 'Dev'}
                    </div>
                    <div className="date-cell">{formatDate(r.released_at)}</div>
                </div>
            ))}
        </div>
    );
}