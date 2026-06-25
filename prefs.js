import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TopNetGraphPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
       const settings = this.getSettings('org.gnome.shell.extensions.topnetgraph');

        const rgbaToHex = (rgba) => {
            const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
            return `#${toHex(rgba.red)}${toHex(rgba.green)}${toHex(rgba.blue)}`.toLowerCase();
        };

        const hexToRgba = (hex) => {
            const value = (hex || '#4d9cff').trim();
            const normalized = value.startsWith('#') ? value.slice(1) : value;
            const fullHex = normalized.length === 3
                ? normalized.split('').map((char) => char + char).join('')
                : normalized;
            const safeHex = fullHex.length >= 6 ? fullHex.slice(0, 6) : '4d9cff';
            const colorValue = parseInt(safeHex, 16) || 0x4d9cff;

            return new Gdk.RGBA({
                red: ((colorValue >> 16) & 0xff) / 255,
                green: ((colorValue >> 8) & 0xff) / 255,
                blue: (colorValue & 0xff) / 255,
                alpha: 1.0,
            });
        };
        
        const page = new Adw.PreferencesPage({
            title: _('TopNetGraph'),
            icon_name: 'network-wired-symbolic',
        });
        window.add(page);

        // Graph Settings Group
        const graphGroup = new Adw.PreferencesGroup({
            title: _('Graph Settings'),
            description: _('Customize the appearance of the network traffic graph'),
        });
        page.add(graphGroup);

        // Graph Type
        const graphTypeRow = new Adw.ComboRow({
            title: _('Graph Type'),
            subtitle: _('Choose how the network traffic is displayed'),
        });
        
        const graphTypeModel = new Gtk.StringList();
        graphTypeModel.append(_('Line Graph'));
        graphTypeModel.append(_('Filled Areas'));
        graphTypeRow.set_model(graphTypeModel);
        
        // Map the settings value to combo box index
        const graphType = settings.get_string('graph-type');
        graphTypeRow.set_selected(graphType === 'line' ? 0 : 1);
        
        graphTypeRow.connect('notify::selected', () => {
            const selected = graphTypeRow.get_selected();
            settings.set_string('graph-type', selected === 0 ? 'line' : 'filled');
        });
        
        graphGroup.add(graphTypeRow);

        // Network Interface
        const normalizeInterfaceValue = (value) => {
            const normalized = (value || '').trim().toLowerCase();
            return normalized === 'auto' ? 'any' : (normalized || 'any');
        };

        const interfaceRow = new Adw.ComboRow({
            title: _('Network Interface'),
            subtitle: _('Select the interface to monitor, or Any for all interfaces'),
        });

        const interfaceModel = new Gtk.StringList();
        const availableInterfaces = ['any'];
        try {
            const netDir = Gio.File.new_for_path('/sys/class/net');
            const enumerator = netDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                if (name && !availableInterfaces.includes(name)) {
                    availableInterfaces.push(name);
                }
            }
        } catch (error) {
            console.warn('[TopNetGraph] Failed to list network interfaces:', error);
        }

        const currentInterface = normalizeInterfaceValue(settings.get_string('network-interface'));
        if (!availableInterfaces.includes(currentInterface)) {
            availableInterfaces.push(currentInterface);
        }

        availableInterfaces.forEach((name) => {
            interfaceModel.append(name === 'any' ? _('Any') : name);
        });

        interfaceRow.set_model(interfaceModel);
        const currentIndex = availableInterfaces.findIndex((name) => name === currentInterface);
        interfaceRow.set_selected(currentIndex >= 0 ? currentIndex : 0);

        interfaceRow.connect('notify::selected', () => {
            const selected = interfaceRow.get_selected();
            const selectedInterface = availableInterfaces[selected] || 'any';
            settings.set_string('network-interface', selectedInterface);
        });
        
        graphGroup.add(interfaceRow);

        // Update Interval
        const intervalRow = new Adw.SpinRow({
            title: _('Update Interval (ms)'),
            subtitle: _('How often to refresh the graph data'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 2000,
                step_increment: 100,
                value: settings.get_int('update-interval'),
            }),
        });
        
        settings.bind('update-interval', intervalRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        
        graphGroup.add(intervalRow);

        // Display Settings Group
        const displayGroup = new Adw.PreferencesGroup({
            title: _('Display Settings'),
            description: _('Control what information is shown'),
        });
        page.add(displayGroup);

        // Show Upload
        const showUploadRow = new Adw.SwitchRow({
            title: _('Show Upload Traffic'),
            subtitle: _('Display upload speed in the graph'),
        });
        
        settings.bind('show-upload', showUploadRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        
        displayGroup.add(showUploadRow);

        // Show Download  
        const showDownloadRow = new Adw.SwitchRow({
            title: _('Show Download Traffic'),
            subtitle: _('Display download speed in the graph'),
        });
        
        settings.bind('show-download', showDownloadRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        
        displayGroup.add(showDownloadRow);

        // Color Settings Group
        const colorGroup = new Adw.PreferencesGroup({
            title: _('Color Settings'),
            description: _('Choose colors for download and upload traffic'),
        });
        page.add(colorGroup);

        const downloadColorRow = new Adw.ActionRow({
            title: _('Download Color'),
            subtitle: _('Color used for download traffic'),
        });
        const downloadColorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            rgba: hexToRgba(settings.get_string('download-color')),
        });
        downloadColorRow.add_suffix(downloadColorButton);
        downloadColorRow.set_activatable_widget(downloadColorButton);
        downloadColorButton.connect('notify::rgba', () => {
            settings.set_string('download-color', rgbaToHex(downloadColorButton.get_rgba()));
        });
        colorGroup.add(downloadColorRow);

        const uploadColorRow = new Adw.ActionRow({
            title: _('Upload Color'),
            subtitle: _('Color used for upload traffic'),
        });
        const uploadColorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            rgba: hexToRgba(settings.get_string('upload-color')),
        });
        uploadColorRow.add_suffix(uploadColorButton);
        uploadColorRow.set_activatable_widget(uploadColorButton);
        uploadColorButton.connect('notify::rgba', () => {
            settings.set_string('upload-color', rgbaToHex(uploadColorButton.get_rgba()));
        });
        colorGroup.add(uploadColorRow);
    }
}