"use client";

import React, { useState, useEffect } from 'react';

// ================= CONSTANTS =================
const APP_DEFS = {
    'ios-parent': { name: 'Parent App', platform: 'ios', type: 'Parent', buildPrefix: 102 },
    'ios-partner': { name: 'Partner App', platform: 'ios', type: 'Partner', buildPrefix: 203 },
    'android-parent': { name: 'Parent App', platform: 'android', type: 'Parent', buildPrefix: 102 },
    'android-partner': { name: 'Partner App', platform: 'android', type: 'Partner', buildPrefix: 203 }
};

// App Store / Play Store IDs for auto-fetch
const APP_FETCH_CONFIG = {
    'ios-parent': { endpoint: '/api/appstore/6756305494' },      // PetYosa iOS
    'ios-partner': { endpoint: '/api/appstore/6756630090' },     // VetYosa iOS
    'android-parent': { endpoint: '/api/playstore/com.petyosa.petapp' },  // PetYosa Android 
    'android-partner': { endpoint: '/api/playstore/com.petyosa.vetapp' }  // VetYosa Android
};

// Calculate build number from version string
// Formula: prefix*1000 + MAJOR*1000 + MINOR*10 + PATCH
// PetApp (Parent): prefix 102 → e.g., 2.2.1 → 102000 + 2000 + 20 + 1 = 104021
// VetApp (Partner): prefix 203 → e.g., 3.1.0 → 203000 + 3000 + 10 + 0 = 206010
const calculateBuildNumber = (version, appId) => {
    if (!version || !appId) return '';

    // Parse version string (e.g., "2.2.1", "6.0", or "capacitor-2.2.1")
    const versionMatch = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!versionMatch) return '';

    const major = parseInt(versionMatch[1], 10);
    const minor = parseInt(versionMatch[2], 10);
    const patch = parseInt(versionMatch[3] || '0', 10);

    const prefix = APP_DEFS[appId]?.buildPrefix || 102;

    // Formula: prefix*1000 + MAJOR*1000 + MINOR*10 + PATCH
    const buildNumber = (prefix * 1000) + (major * 1000) + (minor * 10) + patch;

    return buildNumber.toString();
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
    const [fetchingVersion, setFetchingVersion] = useState(false);
    const [storeVersions, setStoreVersions] = useState({});
    const [isFetchingAll, setIsFetchingAll] = useState(false);

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
        isBreaking: false,
        releaseDate: ''
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
            if (Array.isArray(data)) {
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

    // Helper to get existing release data for an app/environment
    const getExistingRelease = (appId, environment) => {
        const appData = appsData[appId];
        if (!appData) return null;
        const envData = appData[environment];
        if (!envData || envData.version === '—') return null;
        return envData;
    };

    // Pre-fill form with existing data when app/environment changes (for Add Release)
    // Note: This does NOT set the id, so saving will create a new release (not update)
    const prefillFormData = (appId, environment) => {
        const existing = getExistingRelease(appId, environment);
        if (existing) {
            const build = calculateBuildNumber(existing.version, appId);
            setFormData({
                id: '',  // Keep empty so it creates a new release, not updates
                appId,
                environment,
                version: existing.version || '',
                build: build || existing.build || '',
                notes: existing.notes || '',
                isBreaking: existing.is_breaking || existing.breaking || false,
                releaseDate: ''
            });
        } else {
            // No existing release, start fresh but keep app/env selection
            setFormData(prev => ({
                ...prev,
                id: '',
                appId,
                environment,
                version: '',
                build: '',
                notes: '',
                isBreaking: false,
                releaseDate: ''
            }));
        }
    };

    const handleSave = async () => {
        try {
            const url = formData.id ? `/api/releases/${formData.id}` : '/api/releases';
            const method = formData.id ? 'PUT' : 'POST';

            const payload = {
                app_id: formData.appId,
                version: formData.version,
                build: formData.build,
                environment: formData.environment,
                notes: formData.notes,
                is_breaking: formData.isBreaking
            };

            // Add custom date if specified
            if (formData.releaseDate) {
                payload.released_at = new Date(formData.releaseDate).toISOString();
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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

    const handleDelete = async (releaseId, version) => {
        if (!confirm(`Are you sure you want to delete version ${version}?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/releases/${releaseId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                showToast('Deleted!', 'success');
                loadData();
            } else {
                showToast('Error deleting', 'error');
            }
        } catch (err) {
            showToast('Connection error', 'error');
        }
    };

    // Fetch latest version from App Store / Play Store
    const fetchLatestVersion = async () => {
        const fetchConfig = APP_FETCH_CONFIG[formData.appId];

        if (!fetchConfig || !fetchConfig.endpoint) {
            showToast('Auto-fetch not available for this app', 'error');
            return;
        }

        setFetchingVersion(true);
        try {
            const res = await fetch(fetchConfig.endpoint);
            const data = await res.json();

            if (data.success && data.data?.version) {
                const version = data.data.version;
                const build = calculateBuildNumber(version, formData.appId);
                setFormData({ ...formData, version, build });
                showToast(`Fetched v${version}`, 'success');
            } else {
                showToast(data.error?.message || 'Could not fetch version', 'error');
            }
        } catch (err) {
            showToast('Fetch failed - enter manually', 'error');
        } finally {
            setFetchingVersion(false);
        }
    };

    // Fetch all latest versions for all apps and auto-sync to DB
    const fetchAllVersions = async () => {
        setIsFetchingAll(true);
        const results = {};

        try {
            const fetchPromises = Object.entries(APP_FETCH_CONFIG)
                .filter(([_, config]) => config.endpoint)
                .map(async ([appId, config]) => {
                    try {
                        const res = await fetch(config.endpoint);
                        const data = await res.json();
                        if (data.success && data.data?.version) {
                            return { appId, version: data.data.version };
                        }
                    } catch (e) {
                        console.error(`Failed to fetch version for ${appId}`, e);
                    }
                    return { appId, version: null };
                });

            const settledResults = await Promise.allSettled(fetchPromises);

            settledResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value.version) {
                    results[result.value.appId] = result.value.version;
                }
            });

            setStoreVersions(results);

            const fetchedCount = Object.keys(results).length;
            if (fetchedCount === 0) {
                showToast('Could not fetch versions from stores', 'error');
                return;
            }

            const appsToSync = Object.entries(results).filter(([appId, storeV]) => {
                const currentV = appsData[appId]?.production?.version;
                return storeV && storeV !== 'Unknown' && storeV !== currentV;
            });

            if (appsToSync.length === 0) {
                showToast('All apps are already in sync', 'info');
                return;
            }

            setLoading(true);
            showToast(`Fetched ${fetchedCount} store versions. Syncing ${appsToSync.length}...`, 'info');

            let successCount = 0;
            for (const [appId, version] of appsToSync) {
                const success = await syncVersion(appId, version);
                if (success) successCount++;
            }

            if (successCount === appsToSync.length) {
                showToast(`Synced ${successCount} apps successfully!`, 'success');
                loadData();
                setStoreVersions({});
            } else if (successCount > 0) {
                showToast(`Synced ${successCount}/${appsToSync.length} apps. Some failed.`, 'error');
                loadData();
                // keep storeVersions so user can see mismatches
            } else {
                showToast('Sync failed', 'error');
            }
        } finally {
            setLoading(false);
            setIsFetchingAll(false);
        }
    };

    // Sync a specific app version to the database
    const syncVersion = async (appId, version) => {
        if (!appId || !version || version === 'Unknown') return false;

        const build = calculateBuildNumber(version, appId);
        try {
            const res = await fetch('/api/releases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_id: appId,
                    version,
                    build,
                    environment: 'production',
                    notes: 'Auto-synced from Store',
                    is_breaking: false
                })
            });

            if (res.ok) {
                return true;
            } else {
                console.error(`Failed to sync ${appId}`);
                return false;
            }
        } catch (err) {
            console.error(`Sync error for ${appId}`, err);
            return false;
        }
    };

    // Sync all apps that have a different store version
    const syncAll = async () => {
        const appsToSync = Object.entries(storeVersions).filter(([appId, storeV]) => {
            const currentV = appsData[appId]?.production?.version;
            return storeV && storeV !== 'Unknown' && storeV !== currentV;
        });

        if (appsToSync.length === 0) {
            showToast('All apps are already in sync', 'info');
            return;
        }

        setLoading(true);
        let successCount = 0;

        for (const [appId, version] of appsToSync) {
            const success = await syncVersion(appId, version);
            if (success) successCount++;
        }

        if (successCount > 0) {
            showToast(`Synced ${successCount} apps successfully!`, 'success');
            loadData(); // Refresh appsData
            setStoreVersions({}); // Clear store versions to hide badges
        } else {
            showToast('Sync failed', 'error');
        }
        setLoading(false);
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
                                    storeVersion={storeVersions[id]}
                                    onEdit={(env) => {
                                        const v = app[env];
                                        const build = calculateBuildNumber(v.version !== '—' ? v.version : '', id);
                                        setFormData({
                                            id: v._id || '',
                                            appId: id, environment: env,
                                            version: v.version !== '—' ? v.version : '',
                                            build: build || (v.build !== '—' ? v.build : ''),
                                            notes: v.notes || '',
                                            isBreaking: v.breaking || v.is_breaking || false,
                                            releaseDate: ''
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
                    <div className="add-release-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <button className="btn btn-primary" style={{ flex: '1 1 200px' }} onClick={() => {
                            prefillFormData('ios-parent', 'production');
                            setShowAddModal(true);
                        }}>+ Add Release</button>
                        <button
                            className={`btn ${isFetchingAll ? 'loading' : ''}`}
                            style={{ flex: '1 1 150px', backgroundColor: '#000', color: '#fff' }}
                            onClick={fetchAllVersions}
                            disabled={isFetchingAll}
                        >
                            {isFetchingAll ? 'Fetching...' : 'Fetch & Sync'}
                        </button>
                        {Object.keys(storeVersions).some(id => storeVersions[id] && storeVersions[id] !== 'Unknown' && storeVersions[id] !== appsData[id]?.production?.version) && (
                            <button
                                className="btn"
                                style={{ flex: '1 1 100%', backgroundColor: '#059669', color: '#fff', borderColor: '#059669' }}
                                onClick={syncAll}
                            >
                                Sync All with Store
                            </button>
                        )}
                    </div>
                </div>
            )}

            {(activeTab === 'history' || activeTab === 'breaking') && (
                <HistoryList
                    releases={activeTab === 'breaking' ? releases.filter(r => r.is_breaking) : releases}
                    onDelete={handleDelete}
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
                                        onChange={e => {
                                            const newAppId = e.target.value;
                                            prefillFormData(newAppId, formData.environment);
                                        }}>
                                        {Object.entries(APP_DEFS).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.platform})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Env</label>
                                    <select className="form-select" value={formData.environment} disabled={!!formData.id}
                                        onChange={e => {
                                            const newEnv = e.target.value;
                                            prefillFormData(formData.appId, newEnv);
                                        }}>
                                        <option value="production">Production</option>
                                        <option value="development">Development</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Version</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            className="form-input"
                                            value={formData.version}
                                            placeholder="e.g., 2.2.1"
                                            style={{ flex: 1 }}
                                            onChange={e => {
                                                const newVersion = e.target.value;
                                                const newBuild = calculateBuildNumber(newVersion, formData.appId);
                                                setFormData({ ...formData, version: newVersion, build: newBuild });
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-sm"
                                            onClick={fetchLatestVersion}
                                            disabled={fetchingVersion || !APP_FETCH_CONFIG[formData.appId]?.endpoint}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {fetchingVersion ? '...' : '↓ Fetch'}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Build <span style={{ fontSize: '10px', color: '#737373' }}>(auto)</span></label>
                                    <input
                                        className="form-input"
                                        value={formData.build}
                                        readOnly
                                        style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                                        placeholder="Auto-generated"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-checkbox">
                                    <input type="checkbox" checked={formData.isBreaking} onChange={e => setFormData({ ...formData, isBreaking: e.target.checked })} />
                                    <span>Breaking Change</span>
                                </label>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Release Date <span style={{ fontSize: '10px', color: '#737373' }}>(optional)</span></label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.releaseDate}
                                    onChange={e => setFormData({ ...formData, releaseDate: e.target.value })}
                                />
                                <span style={{ fontSize: '11px', color: '#737373', marginTop: '4px', display: 'block' }}>
                                    Leave empty to use current date/time
                                </span>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-textarea" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}></textarea>
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
        } catch (e) { setErr('Connection error'); }
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

function AppCard({ id, app, onEdit, onNotes, storeVersion }) {
    return (
        <div className="app-card">
            <div className="app-header">
                <span className={`platform-dot ${app.platform}`}></span>
                <span className="app-name">{app.platform.toUpperCase()} {app.name}</span>
                {storeVersion && <span className="store-badge">Store: v{storeVersion}</span>}
            </div>
            <div className="versions">
                <VersionBlock
                    label="Prod"
                    data={app.production}
                    onEdit={() => onEdit('production')}
                    onNotes={() => onNotes('production')}
                    storeVersion={storeVersion} // Pass storeVersion to compare with prod
                />
                <VersionBlock label="Dev" data={app.development} onEdit={() => onEdit('development')} onNotes={() => onNotes('development')} />
            </div>
        </div>
    );
}

function VersionBlock({ label, data, onEdit, onNotes, storeVersion }) {
    const isNewerInStore = storeVersion && data.version !== '—' && storeVersion !== data.version;

    return (
        <div className={`version-block ${isNewerInStore ? 'has-update' : ''}`}>
            <label>{label}</label>
            <div className="version-number">
                {data.version}
                {data.breaking && <span className="badge breaking">!</span>}
                {isNewerInStore && <span className="update-marker" title={`Store version ${storeVersion} is different`}>↑</span>}
            </div>
            <div className="version-meta">{data.build} {data.date && `· ${formatDate(data.date)}`}</div>
            <div className="version-actions">
                <button className="btn btn-sm" onClick={onNotes}>Notes</button>
                <button className="btn btn-sm" onClick={onEdit}>Edit</button>
            </div>
        </div>
    );
}

function HistoryList({ releases, onDelete }) {
    const [expandedCategories, setExpandedCategories] = useState({
        'ios-parent': true,
        'ios-partner': true,
        'android-parent': true,
        'android-partner': true
    });

    const toggleCategory = (appId) => {
        setExpandedCategories(prev => ({
            ...prev,
            [appId]: !prev[appId]
        }));
    };

    // Group releases by app_id
    const groupedReleases = releases.reduce((acc, release) => {
        const appId = release.app_id;
        if (!acc[appId]) {
            acc[appId] = [];
        }
        acc[appId].push(release);
        return acc;
    }, {});

    // Define category order
    const categoryOrder = ['ios-parent', 'ios-partner', 'android-parent', 'android-partner'];

    // Category display names
    const categoryNames = {
        'ios-parent': 'iOS Parent App',
        'ios-partner': 'iOS Partner App',
        'android-parent': 'Android Parent App',
        'android-partner': 'Android Partner App'
    };

    if (releases.length === 0) {
        return <div className="history-list"><div className="empty">No Data</div></div>;
    }

    return (
        <div className="history-categories">
            {categoryOrder.map(appId => {
                const categoryReleases = groupedReleases[appId] || [];
                if (categoryReleases.length === 0) return null;

                const isExpanded = expandedCategories[appId];
                const platform = APP_DEFS[appId]?.platform || 'ios';

                return (
                    <div key={appId} className="history-category">
                        <button
                            className="category-header"
                            onClick={() => toggleCategory(appId)}
                        >
                            <div className="category-title">
                                <span className={`platform-dot ${platform}`}></span>
                                <span className="category-name">{categoryNames[appId]}</span>
                                <span className="category-count">{categoryReleases.length}</span>
                            </div>
                            <span className={`category-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
                        </button>

                        {isExpanded && (
                            <div className="history-list">
                                {categoryReleases.map(r => (
                                    <div key={r._id} className="history-row">
                                        <div className="version-cell">{r.version}</div>
                                        <div className="build-cell">Build {r.build}</div>
                                        <div className={`env-badge ${r.environment === 'production' ? 'prod' : 'dev'}`}>
                                            {r.environment === 'production' ? 'Prod' : 'Dev'}
                                        </div>
                                        {r.is_breaking && <span className="badge breaking">Breaking</span>}
                                        <div className="date-cell">{formatDate(r.released_at)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}