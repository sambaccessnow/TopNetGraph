import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Cairo from 'gi://cairo';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

// Network data management class
class NetworkData {
    constructor() {
        this.history = [];
        this.maxHistory = 60; // Keep 60 data points (30 seconds at 500ms intervals)
        this.maxBandwidth = 1024 * 1024; // 1MB/s initial scale
        this.lastStats = new Map(); // Interface -> {rx_bytes, tx_bytes, timestamp}
        this.currentInterface = 'auto';
    }

    addDataPoint(upload, download) {
        const timestamp = Date.now();
        const dataPoint = { 
            timestamp, 
            upload: Math.max(0, upload), 
            download: Math.max(0, download),
            total: Math.max(0, upload + download)
        };
        
        this.history.push(dataPoint);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        // Auto-adjust max bandwidth for better graph scaling
        const maxCurrent = Math.max(upload, download);
        if (maxCurrent > this.maxBandwidth * 0.9) {
            this.maxBandwidth = Math.max(maxCurrent * 1.5, 1024 * 1024);
        } else if (maxCurrent < this.maxBandwidth * 0.2 && this.maxBandwidth > 1024 * 1024) {
            this.maxBandwidth = Math.max(maxCurrent * 3, 1024 * 1024);
        }
    }

    getLatest() {
        return this.history.length > 0 ? this.history[this.history.length - 1] : { upload: 0, download: 0, total: 0 };
    }
}

// Custom graph widget for drawing network traffic
const NetworkGraph = GObject.registerClass(
class NetworkGraph extends St.DrawingArea {
    _init(networkData, settings) {
        super._init({
            style_class: 'network-graph',
            width: 100,
            height: 20,
            reactive: true,
            track_hover: true
        });

        this._networkData = networkData;
        this._settings = settings;
        this._hoverEffect = false;
        this._settingsChangedId = null;
        
        this.connect('repaint', this._onRepaint.bind(this));
        this.connect('notify::hover', () => {
            this._hoverEffect = this.hover;
            this.queue_repaint();
        });

        // Listen for settings changes
        this._connectSettingsSignals();
    }

    _connectSettingsSignals() {
        if (this._settings && !this._settingsChangedId) {
            this._settingsChangedId = this._settings.connect('changed', () => {
                this.queue_repaint();
            });
        }
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        
        if (!cr || width <= 0 || height <= 0) return;

        // Clear background
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        // Background
        const bgAlpha = this._hoverEffect ? 0.15 : 0.08;
        cr.setSourceRGBA(1, 1, 1, bgAlpha);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const history = this._networkData.history;
        if (history.length < 2) {
            // Show "no data" indicator
            cr.setSourceRGBA(0.5, 0.5, 0.5, 0.5);
            cr.arc(width / 2, height / 2, 2, 0, 2 * Math.PI);
            cr.fill();
            return;
        }

        this._drawGraph(cr, width, height, history);
        this._drawCurrentIndicator(cr, width, height);
    }

    _drawGraph(cr, width, height, history) {
        const maxBandwidth = this._networkData.maxBandwidth;
        const stepX = width / Math.max(1, history.length - 1);
        const showUpload = this._getSetting('show-upload', true);
        const showDownload = this._getSetting('show-download', true);
        const graphType = this._getSetting('graph-type', 'filled');
        
        // Draw download area/line (blue)
        if (showDownload) {
            if (graphType === 'line') {
                cr.setSourceRGBA(0.2, 0.6, 1.0, 0.9);
                cr.setLineWidth(1.5);
                cr.moveTo(0, height - (Math.min(history[0].download / maxBandwidth, 1.0) * height * 0.85));
                
                for (let i = 1; i < history.length; i++) {
                    const x = i * stepX;
                    const downloadRatio = Math.min(history[i].download / maxBandwidth, 1.0);
                    const y = height - (downloadRatio * height * 0.85);
                    cr.lineTo(x, y);
                }
                cr.stroke();
            } else {
                cr.setSourceRGBA(0.2, 0.6, 1.0, 0.6);
                cr.moveTo(0, height);
                
                for (let i = 0; i < history.length; i++) {
                    const x = i * stepX;
                    const downloadRatio = Math.min(history[i].download / maxBandwidth, 1.0);
                    const y = height - (downloadRatio * height * 0.85);
                    cr.lineTo(x, y);
                }
                cr.lineTo(width, height);
                cr.closePath();
                cr.fill();
            }
        }

        // Draw upload area/line (orange, stacked on top for filled, separate for line)
        if (showUpload) {
            if (graphType === 'line') {
                cr.setSourceRGBA(1.0, 0.6, 0.2, 0.9);
                cr.setLineWidth(1.5);
                cr.moveTo(0, height - (Math.min(history[0].upload / maxBandwidth, 1.0) * height * 0.85));
                
                for (let i = 1; i < history.length; i++) {
                    const x = i * stepX;
                    const uploadRatio = Math.min(history[i].upload / maxBandwidth, 1.0);
                    const y = height - (uploadRatio * height * 0.85);
                    cr.lineTo(x, y);
                }
                cr.stroke();
            } else {
                cr.setSourceRGBA(1.0, 0.6, 0.2, 0.6);
                cr.moveTo(0, height);
                
                for (let i = 0; i < history.length; i++) {
                    const x = i * stepX;
                    const totalRatio = Math.min((history[i].upload + history[i].download) / maxBandwidth, 1.0);
                    const y = height - (totalRatio * height * 0.85);
                    cr.lineTo(x, y);
                }
                cr.lineTo(width, height);
                cr.closePath();
                cr.fill();
            }
        }

        // Draw outline for better visibility (filled areas only)
        if (graphType === 'filled' && showDownload) {
            cr.setSourceRGBA(1, 1, 1, 0.3);
            cr.setLineWidth(0.5);
            cr.moveTo(0, height - (Math.min(history[0].download / maxBandwidth, 1.0) * height * 0.85));
            
            for (let i = 1; i < history.length; i++) {
                const x = i * stepX;
                const downloadRatio = Math.min(history[i].download / maxBandwidth, 1.0);
                const y = height - (downloadRatio * height * 0.85);
                cr.lineTo(x, y);
            }
            cr.stroke();
        }
    }

    _drawCurrentIndicator(cr, width, height) {
        const latest = this._networkData.getLatest();
        const loadRatio = latest.total / this._networkData.maxBandwidth;
        
        // Status indicator dot
        let r, g, b;
        if (loadRatio > 0.7) {
            [r, g, b] = [1.0, 0.2, 0.2]; // Red - high load
        } else if (loadRatio > 0.3) {
            [r, g, b] = [1.0, 0.8, 0.0]; // Yellow - medium load  
        } else {
            [r, g, b] = [0.2, 1.0, 0.2]; // Green - low load
        }

        cr.setSourceRGBA(r, g, b, 0.9);
        cr.arc(width - 3, 3, 1.5, 0, 2 * Math.PI);
        cr.fill();
    }

    _getSetting(key, defaultValue) {
        if (!this._settings) return defaultValue;
        
        switch (key) {
            case 'show-upload':
            case 'show-download':
                return this._settings.get_boolean(key);
            case 'graph-type':
                return this._settings.get_string(key);
            default:
                return defaultValue;
        }
    }

    destroy() {
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
    }
});

// Main panel button with graph and menu
const NetworkGraphButton = GObject.registerClass(
class NetworkGraphButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'TopNetGraph', false);

        this._settings = settings;
        this._networkData = new NetworkData();
        this._updateId = null;
        this._settingsChangedId = null;
        this._interfaceChangedId = null;
        this._netDevFile = null;
        
        // Create the graph widget
        this._graph = new NetworkGraph(this._networkData, this._settings);
        this.add_child(this._graph);

        // Create popup menu
        this._createMenu();
        
        // Initialize interface setting and file handle
        this._initializeSettings();
        this._initializeFileHandle();
        
        // Start monitoring
        this._startMonitoring();

        // Listen for settings changes
        this._connectSettingsSignals();
    }

    _initializeSettings() {
        if (this._settings) {
            this._networkData.currentInterface = this._settings.get_string('network-interface');
        }
    }

    _initializeFileHandle() {
        this._netDevFile = Gio.File.new_for_path('/proc/net/dev');
    }

    _connectSettingsSignals() {
        if (!this._settings) return;

        this._settingsChangedId = this._settings.connect('changed::update-interval', () => {
            this._restartMonitoring();
        });

        this._interfaceChangedId = this._settings.connect('changed::network-interface', () => {
            this._networkData.currentInterface = this._settings.get_string('network-interface');
        });
    }

    _createMenu() {
        // Current stats
        this._uploadItem = new PopupMenu.PopupMenuItem(_('Upload: 0 B/s'), { reactive: false });
        this._downloadItem = new PopupMenu.PopupMenuItem(_('Download: 0 B/s'), { reactive: false });
        this._totalItem = new PopupMenu.PopupMenuItem(_('Total: 0 B/s'), { reactive: false });
        
        this.menu.addMenuItem(this._uploadItem);
        this.menu.addMenuItem(this._downloadItem);
        this.menu.addMenuItem(this._totalItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Interface info
        this._interfaceItem = new PopupMenu.PopupMenuItem(_('Interface: Detecting...'), { reactive: false });
        this.menu.addMenuItem(this._interfaceItem);
    }

    _startMonitoring() {
        this._updateNetworkStats();
        
        const updateInterval = this._settings ? this._settings.get_int('update-interval') : 500;
        this._updateId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, updateInterval, () => {
            this._updateNetworkStats();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartMonitoring() {
        if (this._updateId) {
            GLib.Source.remove(this._updateId);
            this._updateId = null;
        }
        this._startMonitoring();
    }

    _updateNetworkStats() {
        if (!this._netDevFile) return;

        this._netDevFile.load_contents_async(null, (file, result) => {
            try {
                const [success, contents] = file.load_contents_finish(result);

                if (!success || !contents) {
                    return;
                }

                const data = new TextDecoder().decode(contents);
                const stats = this._parseNetworkData(data);

                if (stats) {
                    this._networkData.addDataPoint(stats.upload, stats.download);
                    this._updateMenuStats(stats);
                    if (this._graph) {
                        this._graph.queue_repaint();
                    }
                }
            } catch (error) {
                logError(error, 'TopNetGraph');
            }
        });
    }

    _parseNetworkData(data) {
        const lines = data.split('\n');
        let totalUpload = 0, totalDownload = 0;
        let activeInterfaces = [];
        const now = GLib.get_monotonic_time() / 1000; // Convert to milliseconds
        const targetInterface = this._networkData.currentInterface;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.includes('Inter-|') || trimmed.includes('face |')) continue;
            
            const parts = trimmed.split(/\s+/);
            if (parts.length < 17) continue;
            
            const interfaceName = parts[0].replace(':', '');
            
            // Skip loopback
            if (interfaceName === 'lo') continue;
            
            // Filter by specific interface if not 'auto'
            if (targetInterface !== 'auto' && interfaceName !== targetInterface) continue;
            
            const rxBytes = parseInt(parts[1]) || 0;
            const txBytes = parseInt(parts[9]) || 0;
            
            // Skip interfaces with no traffic (unless specifically selected)
            if (targetInterface === 'auto' && rxBytes === 0 && txBytes === 0) continue;
            
            const lastData = this._networkData.lastStats.get(interfaceName);
            
            if (lastData && now > lastData.timestamp) {
                const timeDelta = (now - lastData.timestamp) / 1000; // Convert to seconds
                
                if (timeDelta > 0 && timeDelta < 2) { // Reasonable time delta
                    const rxRate = Math.max(0, (rxBytes - lastData.rxBytes) / timeDelta);
                    const txRate = Math.max(0, (txBytes - lastData.txBytes) / timeDelta);
                    
                    totalDownload += rxRate;
                    totalUpload += txRate;
                    activeInterfaces.push(interfaceName);
                }
            }
            
            this._networkData.lastStats.set(interfaceName, {
                rxBytes,
                txBytes,
                timestamp: now
            });
        }
        
        // Update interface display
        const interfaceText = activeInterfaces.length > 0 ? 
            `${_('Interface')}: ${activeInterfaces.join(', ')}` : 
            _('Interface: No active connections');
        
        if (this._interfaceItem) {
            this._interfaceItem.label.text = interfaceText;
        }
        
        return activeInterfaces.length > 0 ? { upload: totalUpload, download: totalDownload } : null;
    }

    _updateMenuStats(stats) {
        const formatBytes = (bytes) => {
            if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
            if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
            return `${Math.round(bytes)} B/s`;
        };

        if (this._uploadItem) {
            this._uploadItem.label.text = `${_('Upload')}: ${formatBytes(stats.upload)}`;
        }
        if (this._downloadItem) {
            this._downloadItem.label.text = `${_('Download')}: ${formatBytes(stats.download)}`;
        }
        if (this._totalItem) {
            this._totalItem.label.text = `${_('Total')}: ${formatBytes(stats.upload + stats.download)}`;
        }
    }

    destroy() {
        if (this._updateId) {
            GLib.Source.remove(this._updateId);
            this._updateId = null;
        }

        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._interfaceChangedId && this._settings) {
            this._settings.disconnect(this._interfaceChangedId);
            this._interfaceChangedId = null;
        }
        
        super.destroy();
    }
});

// Extension main class
export default class TopNetGraphExtension extends Extension {
    enable() {
        console.log('TopNetGraph: Enabling extension');
        
        this._settings = this.getSettings();
        this._indicator = new NetworkGraphButton(this._settings);
        Main.panel.addToStatusArea('topnetgraph', this._indicator);
    }

    disable() {
        console.log('TopNetGraph: Disabling extension');
        
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._settings) {
            this._settings = null;
        }
    }
}
