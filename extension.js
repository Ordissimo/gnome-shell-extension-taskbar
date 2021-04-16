//  GNOME Shell Extension TaskBar 2020
//  Copyright (C) 2013-2018 zpydr
//  Copyright (C) 2020 c0ldplasma
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <https://www.gnu.org/licenses/>.
//

const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const AppFavorites = imports.ui.appFavorites;
const Layout = imports.ui.layout;
const Main = imports.ui.main;

const Util = imports.misc.util;

const MessageTray = imports.ui.messageTray;
const Panel = imports.ui.main.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ThumbnailsSlider = imports.ui.overviewControls.ThumbnailsSlider.prototype;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Extension.imports.convenience;

const Prefs = Extension.imports.prefs;
const ShellVersion = imports.misc.config.PACKAGE_VERSION.split(".").map(function(x) {
	return +x;
});
const Windows = Extension.imports.windows;

const RESETBOTTOMPANELCOLOR = 'rgba(0,0,0,1)';

const LEFTBUTTON = 1;
const MIDDLEBUTTON = 2;
const RIGHTBUTTON = 3;
const NOHOTCORNER = 54321;
const DESKTOPICON = Extension.path + '/images/desktop-button-default.png';
const APPVIEWICON = Extension.path + '/images/appview-button-default.svg';
const BPTRAYICON = Extension.path + '/images/bottom-panel-tray-button.svg';
const PREVIOUSKEY = 'key-previous-task';
const NEXTKEY = 'key-next-task';
const DESKTOPKEY = 'key-toggle-desktop';

let light = null;
let nightlight = null;
let volume = null;
let network = null;
let bluetooth = null;
let power = null;
let calendar = null;
let user = null;
let notification = null;


let ExecProxy = null;

const ExecIface = '<node> \
<interface name="com.ordissimo.Exec"> \
<method name="desktop"> \
    <arg type="s" direction="in"/> \
</method> \
</interface> \
</node>';


class Exec {
	constructor(settings) {
		this.settings = settings;
                var va  = settings.get_value("override-desktop-list");
		var n1 = va.n_children();
		this.override_desktop_list = new Array()
                for (var i = 0; i < n1; i++) {
                    var cval = va.get_child_value(i);
		    var str= cval.get_string().toString();
                    // log("Value[" + i + "] = " +  str);
		    var ar = str.split(';');
		    this.override_desktop_list[ar[0]] = ar[1];
                    //log("Value[" + i + "] = " +  cval.get_string());
                }
		this._impl = Gio.DBusExportedObject.wrapJSObject(ExecIface, this);
		this._impl.export(Gio.DBus.session, '/com/ordissimo/Exec');
		Gio.DBus.session.own_name('com.ordissimo.Exec',
		            Gio.BusNameOwnerFlags.REPLACE,
			    null, null);
	}

	desktop(name) {
		let e;
		let favoriteapp = Shell.AppSystem.get_default().lookup_app(name);
		if (favoriteapp === null) {
			return;
		}
		let appInfo = Gio.DesktopAppInfo.new(favoriteapp.get_id());
		log("FavoritApp : " + favoriteapp.get_name());
		log("AppInfo : " + appInfo.get_name());
		if (appInfo && appInfo.get_boolean('X-ORDISSIMO-NoWindows')) {
			try {
				GLib.spawn_command_line_async(appInfo.get_executable())
			} catch (e) {
				log(e)
			}
		}
		else {
			let windowTracker = Shell.WindowTracker.get_default();
			if (windowTracker) {
				let allWindows = global.display.get_tab_list(Meta.TabList.NORMAL, null);
				if (allWindows) {
					let myappid = favoriteapp.get_id();
		                        for(var key in this.override_desktop_list) {
						if (this.override_desktop_list[key].search(favoriteapp.get_id()) > -1) {
							myappid = key;
							break;
                                                }
						else if (key == myappid ) {
							myappid = this.override_desktop_list[key];
							break;
						}

					}
                                        log(">App Id " + favoriteapp.get_id());
                                        log(">My App Id " + myappid);
				        allWindows.forEach(function(w) {
                                               log(">\tWindow Name " + windowTracker.get_window_app(w).get_id());
					},windowTracker, myappid, favoriteapp);
					let cachedWindows = allWindows.filter(w => windowTracker.get_window_app(w).get_id() === favoriteapp.get_id());
					if (!cachedWindows || cachedWindows.length == 0) {
						log("\tNot Found ...");
					        cachedWindows = allWindows.filter(w => myappid.search(windowTracker.get_window_app(w).get_id()) > -1);
					}
					if (!cachedWindows || cachedWindows.length == 0) {
						log("\tCreate new Windows ...");
						favoriteapp.activate()
					}
					else {
						log("\tSwitch to workspace ...");
						let workspace = cachedWindows[0].get_workspace()
						if (workspace) {
		                                        if (appInfo && appInfo.get_boolean('NoDisplay')) {
						               log("\t Activate" + favoriteapp.get_id() + " => " + appInfo.get_id());
					                       try {
								       favoriteapp.open_new_window(-1);
								       // GLib.spawn_command_line_async(appInfo.get_executable())
							       } catch (e) {
								       log(e)
							       } 
						               // favoriteapp.activate()
							}
							Main.wm.actionMoveWorkspace(workspace)
						}
					}
				}
			}
		}
	}

        destroy() {
                this._dbusImpl.unexport();
        }
};


function init(extensionMeta) {
	return new TaskBar(extensionMeta);
}

function TaskBar(extensionMeta) {
	this.init(extensionMeta);
}

TaskBar.prototype = {
	active: null,
	activeTask: null,
	activeWorkspaceIndex: null,
	activeWorkspace: null,
	activitiesStyle: null,
	activitiesContainer: null,
	alwaysZoomOut: null,
	app: null,
	appearance: null,
	appearances: [],
	appMenuColor: null,
	appMenuContainer: null,
	appMenuStyle: null,
	appname: null,
	attentionStyle: null,
	attentionStyleChanged: null,
	attentionStyleChangeTimeout: null,
	backgroundColor: null,
	backgroundStyleColor: null,
	barriers: null,
	blacklist: [],
	blacklistapp: null,
	bottomPanelActor: null,
	bottomPanelBackgroundColor: null,
	bottomPanelBackgroundStyle: null,
	bottomPanelEndIndicator: null,
	bottomPanelHeight: null,
	bottomPanelVertical: null,
	boxBottomPanelTrayButton: null,
	boxDesktop: null,
	boxMainDesktopButton: null,
	boxMainFavorites: null,
	boxMainAggregate: null,
	boxMain: null,
	boxMainSystem: null,
	boxMainShowAppsButton: null,
	boxMainTasksId: null,
	boxMainTasks: null,
	boxMainWorkspaceButton: null,
	boxShowApps: null,
	boxTray: null,
	boxWorkspace: null,
	buttonDesktop: null,
	buttonfavorite: null,
	buttonaggregate: null,
	button: null,
	buttonShowApps: null,
	buttonTask: null,
	buttonTaskLayout: null,
	buttonTaskWidth: null,
	buttonTray: null,
	buttonWorkspace: null,
	changedId: null,
	countTasks: null,
	dash: null,
	dashHeight: null,
	dashWidth: null,
	dateMenuColor: null,
	dateMenuContainer: null,
	dateMenuStyle: null,
	desktopButtonIcon: null,
	desktopView: null,
	favoriteappName: null,
	favoriteapp: null,
	favorites: null,
	favoritesPreview: null,
	aggregateappName: null,
	aggregateapp: null,
	aggregate: null,
	focusWindow: null,
	globalThemeChangedId: null,
	height: null,
	hidingId2: null,
	hidingId: null,
	hoverComponent: null,
	hoverStyle: null,
	iconDesktop: null,
	iconPath: null,
	iconShowApps: null,
	panelSize: null,
	iconTask: null,
	iconThemeChangedId: null,
	iconTray: null,
	inactiveBackgroundStyleColor: null,
	inactiveTask: null,
	index: null,
	indicatorCount: null,
	installedChangedId: null,
	i: null,
	itemHeight: null,
	itemWidth: null,
	j: null,
	k: null,
	key: null,
	labelHeight: null,
	labelNamePreview: null,
	labelTask: null,
	labelTitlePreview: null,
	labelTotalWorkspace: null,
	labelTray: null,
	labelWidth: null,
	labelWorkspaceIndex: null,
	labelWorkspace: null,
	lastFocusedWindow: null,
	lastFocusedWindowUserTime: null,
	leftbutton: null,
	mainBox: null,
	maxWindows: null,
	menuQuit: null,
	messageTrayCountAddedId: null,
	messageTrayCountRemovedId: null,
	messageTrayHidingId: null,
	messageTrayShowingId: null,
	monitorChangedId: null,
	mutterWindow: null,
	newActiveWorkspace: null,
	newBox: null,
	newShowTray: null,
	newTasksContainerWidth: null,
	newWidth: null,
	nextTask: null,
	node: null,
	nonExpandedWidth: null,
	numButton: null,
	nWorkspacesId: null,
	originalLeftPanelCornerStyle: null,
	originalRightPanelCornerStyle: null,
	originalTopPanelStyle: null,
	overviewHidingId: null,
	overviewShowingId: null,
	panelBox: null,
	panelIconSize: null,
	panelPosition: null,
	panelSet: null,
	fontSize: null,
	panelStyleChangedId: null,
	pbchildren: null,
	positionAppearance: null,
	positionBoxBottomSystem: null,
	positionBoxBottomEnd: null,
	positionBoxBottomMiddle: null,
	positionBoxBottomSettings: null,
	positionBoxBottomStart: null,
	positionMaxRight: null,
	posparent: null,
	posparentWidth: null,
	preview: null,
	previewTimer2: null,
	previewTimer: null,
	previousTask: null,
	primary: null,
	resetHover: null,
	rightbutton: null,
	scale: null,
	screenShieldLockId: null,
	scrollDirection: null,
	separatorAppview: null,
	separatorBoxMain: null,
	separatorDesktop: null,
	separatorFavorites: null,
	separatorAggregate: null,
	separatorLeftAppview: null,
	separatorLeftBoxMain: null,
	separatorLeftDesktop: null,
	separatorLeftFavorites: null,
	separatorLeftAggregate: null,
	separatorLeftTasks: null,
	separatorLeftWorkspaces: null,
	separatorRightAppview: null,
	separatorRightBoxMain: null,
	separatorRightDesktop: null,
	separatorRightFavorites: null,
	separatorRightAggregate: null,
	separatorRightTasks: null,
	separatorRightWorkspaces: null,
	separatorTasks: null,
	separatorWorkspaces: null,
	setAnchorPoint: null,
	setTaskBar: null,
	settingSignals: [],
	settings: null,
	showAppsIcon: null,
	showTray: null,
	signalDesktop: null,
	signalShowApps: null,
	signalsTask: [],
	signalTray: null,
	spaces: null,
	stageX: null,
	stageY: null,
	systemMenuColor: null,
	systemMenuContainer: null,
	systemMenuStyle: null,
	taskMenu: null,
	taskMenuIsOpen: null,
	taskMenuManager: null,
	taskMenuUp: null,
	tasksContainerWidth: null,
	tasksLabelColor: null,
	tasksLabelStyle: null,
	tasksList: [],
	tasksWidth: null,
	tbp: null,
	threshold: null,
	thumbnail: null,
	title: null,
	toggleOverview: null,
	topPanelBackgroundColor: null,
	topPanelBackgroundStyle: null,
	topPanelOriginalBackgroundColor: null,
	totalWidth: null,
	totalWorkspace: null,
	tpobc: null,
	trayIcon: null,
	type: null,
	userTime: null,
	variant: null,
	width: null,
	windowDemandsAttentionId: null,
	windows: null,
	windowsList: [],
	windowTask: null,
	windowTexture: null,
	windowWorkspace: null,
	workspace: null,
	workspaceButtonColor: null,
	workspaceButtonStyle: null,
	workspaceSwitchedId: null,
	workspaceTask: null,
	x: null,
	xsettings: null,
	y: null,
	yOffset: null,
	statusArea: {},
	favoriteSelected: {},
	boxFavorites: [],
	iconFavorites: [],
	iconNameFavorites: [],
	labelFavorites: [],
	selectedFavorites: [],
	boxFavoriteEmpty: null,
	menuManager: null,
	workspaceSwitch: null,

	init: function(extensionMeta) {
		this.extensionMeta = extensionMeta;
	},

	onParamChanged: function() {
		if (!this.settings.get_boolean("reset-flag")) {
			this.disable();
			this.enable();
		}
	},

	enable: function() {
                Main.panel.statusArea.aggregateMenu.container.hide();
                Main.panel.statusArea.dateMenu.container.hide();
                Main.panel._centerBox.remove_child(Main.panel.statusArea.dateMenu.container);

	        this.workspaceSwitch = global.workspace_manager.connect('workspace-switched', Lang.bind(this, this.workspaceSwitched));
                network = new Extension.imports.indicators.network.NetworkIndicator();
                // bluetooth = new Extension.imports.indicators.bluetooth.BluetoothIndicator();
                volume = new Extension.imports.indicators.volume.VolumeIndicator();
                power = new Extension.imports.indicators.power.PowerIndicator();
                // calendar = new Extension.imports.indicators.calendar.CalendarIndicator();
                // notification = new Extension.imports.indicators.notification.NotificationIndicator();
                // user = new Extension.imports.indicators.system.UserIndicator();
                // nightlight = new Extension.imports.indicators.nightlight.NightLightIndicator();
                light = new Extension.imports.indicators.light.LightIndicator();
	
		this.settings = Lib.getSettings();

		this.menuManager = new PopupMenu.PopupMenuManager(Main.panel);

		//Top Panel Background Color
		this.changeTopPanelBackgroundColor();

		//First Start
		this.firstStart();

		//Verify other Extensions
		this.otherExtensions();

		//Add TaskBar
		this.addTaskBar();

		//Add Separators
		this.addSeparators();

		//Set TaskBar Position
		this.onPositionChanged();

		//Add Favorites
		this.addFavorites();

		//Add Appview Button
		this.addShowAppsButton();

		//Add Workspace Button
		this.addWorkspaceButton();

		//Add Desktop Button
		this.addDesktopButton();

		//Add Tray Button
		this.addTrayButton();

		//Activities Button
		this.initDisplayActivitiesButton();

		//Hot Corner
		this.initEnableHotCorner();

		//Application Menu
		this.initDisplayApplicationMenu();

		//Date Menu
		this.initDisplayDateMenu();

		//System Menu
		this.initDisplaySystemMenu();

		//Add Aggregate
	        this.addAggregate();

		//Dash
		this.initDisplayDash();

		//Workspace Selector
		this.initDisplayWorkspaceSelector();

		//Init Windows Manage Callbacks
		this.initWindows();

		//Order of Appearance
		this.appearanceOrder();

		//Preferences Hover Event
		this.hoverEvent();

		//Top Panel
		this.initDisplayTopPanel();

		//Reinit Extension on Param Change
		this.setSignals();
		this.setSystemSignals();

		//Keybindings
		this.keybindings();

                ExecProxy = new Exec(this.settings);
	},

	disable: function() {
                ExecProxy.destroy();
                ExecProxy = null;
                //Disconnect Workspace Signals
                if (this.workspaceSwitch !== null) {
                        global.workspace_manager.disconnect(this.workspaceSwitch);
                        this.workspaceSwitch = null;
                }

		//Disconnect Overview Signals
		if (this.overviewHidingId !== null) {
			Main.overview.disconnect(this.overviewHidingId);
			this.overviewHidingId = null;
		}
		if (this.overviewShowingId !== null) {
			Main.overview.disconnect(this.overviewShowingId);
			this.overviewShowingId = null;
		}

		if (this.settings.get_boolean("display-aggregate")) {
                        if (light)
                             light.destroy();
/*
                        if (nightlight)
                             nightlight.destroy();
*/
                        if (volume)
                             volume.destroy();
                        if (power)
                             power.destroy();
                        if (network)
                             network.destroy();
/*
                        if (bluetooth)
                             bluetooth.destroy();
                        if (calendar)
                             calendar.destroy();
                        if (user)
                             user.destroy();
                        if (notification)
                             notification.destroy();
*/
                }

		//Show Activities if hidden
		if (!this.settings.get_boolean("activities-button"))
			this.activitiesContainer.show();

		//Reset Activities Button Color if changed
		if (this.settings.get_string("activities-button-color") !== "unset")
			Main.panel.statusArea.activities.set_style("None");

		//Enable Hot Corner if disabled
		if ((!this.settings.get_boolean("hot-corner")) && (ShellVersion[1] < 26))
			Main.layoutManager._updateHotCorners();

		//Show and disconnect Application Menu if hidden
		if (!this.settings.get_boolean("application-menu")) {
			this.appMenuContainer.show();
			Shell.WindowTracker.get_default().disconnect(this.hidingId2);
			Main.overview.disconnect(this.hidingId);
		}

		//Reset Application Menu Color if changed
		if (this.settings.get_string("application-menu-color") !== "unset")
			Main.panel.statusArea.appMenu.set_style("None");

		//Show Date Menu if hidden
		if (!this.settings.get_boolean("date-menu"))
			this.dateMenuContainer.show();

		//Reset Date Menu Color if changed
		if (this.settings.get_string("date-menu-color") !== "unset")
			Main.panel.statusArea.dateMenu.set_style("None");

		//Show System Menu if hidden
		if (!this.settings.get_boolean("system-menu"))
			this.systemMenuContainer.show();

		//Reset System Menu Color if changed
		if (this.settings.get_string("system-menu-color") !== "unset")
			Main.panel.statusArea.aggregateMenu.set_style("None");

		//Show Dash if hidden
		if (!this.settings.get_boolean("dash")) {
			this.dash.set_height(this.dashHeight);
			this.dash.set_width(this.dashWidth);
		}

		//Show Workspace Selector if hidden
		if (!this.settings.get_boolean("workspace-selector")) {
			ThumbnailsSlider._getAlwaysZoomOut = this.alwaysZoomOut;
			ThumbnailsSlider.getNonExpandedWidth = this.nonExpandedWidth;
		}

		//Disconnect Workspace Signals
		if (this.workspaceSwitchedId !== null) {
			global.workspace_manager.disconnect(this.workspaceSwitchedId);
			this.workspaceSwitchedId = null;
		}
		if (this.nWorkspacesId !== null) {
			global.workspace_manager.disconnect(this.nWorkspacesId);
			this.nWorkspacesId = null;
		}

		//Disconnect Favorites Signals
		if (this.installedChangedId !== null) {
			Shell.AppSystem.get_default().disconnect(this.installedChangedId);
			this.installedChangedId = null;
		}
		if (this.changedId !== null) {
			AppFavorites.getAppFavorites().disconnect(this.changedId);
			this.changedId = null;
		}

		//Disconnect Message Tray Sources Added Signal
		if (this.messageTrayCountAddedId !== null) {
			if (ShellVersion[1] <= 14)
				Main.messageTray.disconnect(this.messageTrayCountAddedId);
			this.messageTrayCountAddedId = null;
		}

		//Disconnect Message Tray Sources Removed Signal
		if (this.messageTrayCountRemovedId !== null) {
			if (ShellVersion[1] <= 14)
				Main.messageTray.disconnect(this.messageTrayCountRemovedId);
			this.messageTrayCountRemovedId = null;
		}

		//Disconnect Message Tray Showing Signal
		if (this.messageTrayShowingId !== null) {
			if (ShellVersion[1] <= 14)
				Main.messageTray.disconnect(this.messageTrayShowingId);
			this.messageTrayShowingId = null;
		}

		//Disconnect Message Tray Hiding Signal
		if (this.messageTrayHidingId !== null) {
			if (ShellVersion[1] <= 14)
				Main.messageTray.disconnect(this.messageTrayHidingId);
			this.messageTrayHidingId = null;
		}

		//Reset Message Tray
		if (this.showTray !== null) {
			if (ShellVersion[1] <= 14)
				MessageTray.MessageTray.prototype._showTray = this.showTray;
			this.showTray = null;
		}

		//Disconnect Setting Signals
		if (this.settingSignals !== null) {
			this.settingSignals.forEach(
				function(signal) {
					this.settings.disconnect(signal);
				},
				this
			);
			this.settingSignals = null;
		}

		//Disconnect Monitor Change Signals
		if (this.monitorChangedId !== null) {
			Main.layoutManager.disconnect(this.monitorChangedId);
			this.monitorChangedId = null;
		}

		//Disconnect Texture Cache Signals
		if (this.iconThemeChangedId !== null) {
			St.TextureCache.get_default().disconnect(this.iconThemeChangedId);
			this.iconThemeChangedId = null;
		}

		//Disconnect Global Theme Signals
		if (this.globalThemeChangedId !== null) {
			St.ThemeContext.get_for_stage(global.stage).disconnect(this.globalThemeChangedId);
			this.globalThemeChangedId = null;
		}

		//Disconnect Window Demands Attention Signals
		if (this.windowDemandsAttentionId !== null) {
			global.display.disconnect(this.windowDemandsAttentionId);
			this.windowDemandsAttentionId = null;
		}

		//Disconnect Lock Screen Signals
		if (this.screenShieldLockId !== null) {
			Main.screenShield.disconnect(this.screenShieldLockId);
			this.screenShieldLockId = null;
		}

		//Hide current preview if necessary
		this.hidePreview();

		//Disconnect Tasks Container Scroll Signals
		if (this.boxMainTasksId !== null) {
			this.boxMainTasks.disconnect(this.boxMainTasksId);
			this.boxMainTasksId = null;
		}

		//Remove Keybindings
		if (Main.wm.removeKeybinding) {
			Main.wm.removeKeybinding(PREVIOUSKEY);
			Main.wm.removeKeybinding(NEXTKEY);
			Main.wm.removeKeybinding(DESKTOPKEY);
		} else {
			global.display.remove_keybinding(PREVIOUSKEY);
			global.display.remove_keybinding(NEXTKEY);
			global.display.remove_keybinding(DESKTOPKEY);
		}

		//Remove TaskBar
		if (this.windows !== null) {
			this.windows.destruct();
			this.windows = null;
		}
		if (this.bottomPanelActor !== null) {
			this.bottomPanelActor.destroy();
			this.bottomPanelActor = null;
		}
		if ((this.setAnchorPoint) && (ShellVersion[1] <= 14)) {
			Main.messageTray.set_anchor_point(0, 0);
			Main.messageTray._notificationWidget.set_anchor_point(0, 0);
			this.setAnchorPoint = false;
		}
		if (this.newBox !== null) {
			this.newBox.remove_child(this.boxMain);
			this.newBox = null;
		}
		if (this.boxMain !== null)
			this.boxMain = null;
		if (this.boxMainSystem !== null)
			this.boxMainSystem = null;
		if (this.mainBox !== null)
			this.mainBox = null;
		this.cleanTasksList();
		if (this.topPanelBackgroundColor !== 'unset') {
			if (ShellVersion[1] <= 16) {
				Main.panel._leftCorner.show();
				Main.panel._rightCorner.show();
			}
			Main.panel._leftCorner.set_style(this.originalLeftPanelCornerStyle);
			Main.panel._rightCorner.set_style(this.originalRightPanelCornerStyle);
		}
		if ((this.topPanelBackgroundColor !== 'unset') || (this.panelSet))
			Main.panel.set_style(this.originalTopPanelStyle);
		if (!this.settings.get_boolean("top-panel")) {
			Main.layoutManager.removeChrome(Main.layoutManager.panelBox);
			Main.layoutManager.addChrome(Main.layoutManager.panelBox, {
				affectsStruts: true
			});
			Main.panel._leftCorner.show();
			Main.panel._rightCorner.show();
			Main.panel.show();
		}
                Main.panel.statusArea.aggregateMenu.container.show();
		Main.panel.statusArea.dateMenu.container.show();
		Main.panel._centerBox.add_child(Main.panel.statusArea.dateMenu.container);
	},

	setSignals: function() {
		//Reinit Extension on Param Change
		this.settingSignals = [
			this.settings.connect("changed::panel-size", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::panel-size-bottom", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tb-icon-size", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tb-icon-size-bottom", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tb-label-size", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tb-label-size-bottom", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::content-size", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::font-size-bottom", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::panel-box", Lang.bind(this, this.onBoxChanged)),
			this.settings.connect("changed::panel-position", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-favorites", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-aggregate", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-showapps-button", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-workspace-button", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::workspace-button-index", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::workspace-button-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-workspace-button-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::workspace-button-width", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-desktop-button", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::overview", Lang.bind(this, this.setOverview)),
			this.settings.connect("changed::tray-button", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tray-button-empty", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::desktop-button-icon", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::appview-button-icon", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tray-button-icon", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::sort-tasks", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::active-task-frame", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::inactive-task-frame", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::active-task-background-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::active-task-background-color-set", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::inactive-task-background-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::inactive-task-background-color-set", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-label", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-label-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-tasks-label-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::inactive-tasks-label-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-inactive-tasks-label-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-frame-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-tasks-frame-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::inactive-tasks-frame-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-inactive-tasks-frame-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-width", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-spaces", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::blink-tasks", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::blacklist-set", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::top-panel-background-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::top-panel-background-alpha", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::bottom-panel-background-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-tasks", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-box-main", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-box-main", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-tasks", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-tasks", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-desktop", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-desktop", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-workspaces", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-workspaces", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-appview", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-appview", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-favorites", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-favorites", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-left-aggregate", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::separator-right-aggregate", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::top-panel", Lang.bind(this, this.displayTopPanel)),
			this.settings.connect("changed::activities-button", Lang.bind(this, this.displayActivities)),
			this.settings.connect("changed::activities-button-color", Lang.bind(this, this.colorActivities)),
			this.settings.connect("changed::hot-corner", Lang.bind(this, this.enableHotCorner)),
			this.settings.connect("changed::application-menu", Lang.bind(this, this.displayApplicationMenu)),
			this.settings.connect("changed::application-menu-color", Lang.bind(this, this.colorApplicationMenu)),
			this.settings.connect("changed::date-menu", Lang.bind(this, this.displayDateMenu)),
			this.settings.connect("changed::date-menu-color", Lang.bind(this, this.colorDateMenu)),
			this.settings.connect("changed::system-menu", Lang.bind(this, this.displaySystemMenu)),
			this.settings.connect("changed::system-menu-color", Lang.bind(this, this.colorSystemMenu)),
			this.settings.connect("changed::dash", Lang.bind(this, this.displayDash)),
			this.settings.connect("changed::workspace-selector", Lang.bind(this, this.displayWorkspaceSelector)),
			this.settings.connect("changed::position-changed", Lang.bind(this, this.appearancePositionChange)),
			this.settings.connect("changed::bottom-panel", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::bottom-panel-vertical", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::position-bottom-box", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-all-workspaces", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::tasks-container-width-new", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::hover-event", Lang.bind(this, this.hoverEvent)),
			this.settings.connect("changed::blacklist", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::find-apps", Lang.bind(this, this.findApps)),
			this.settings.connect("changed::display-preview-background-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::display-preview-label-color", Lang.bind(this, this.onParamChanged)),
			this.settings.connect("changed::export-settings", Lang.bind(this, this.exportSettings)),
			this.settings.connect("changed::import-settings", Lang.bind(this, this.importSettings)),
			this.settings.connect("changed::reset-all", Lang.bind(this, this.resetAll)),
			this.settings.connect("changed::reset-flag", Lang.bind(this, this.onParamChanged))
		];
	},

	//Monitor Change, Icon and Global Theme Change
	setSystemSignals: function() {
		this.monitorChangedId = null;
		this.iconThemeChangedId = null;
		this.globalThemeChangedId = null;
		this.windowDemandsAttentionId = null;
		this.screenShieldLockId = null;
		this.panelStyleChangedId = null;
		this.mainBox = null;
		this.overviewHidingId = null;
		this.overviewShowingId = null;
		this.monitorChangedId = Main.layoutManager.connect('monitors-changed', Lang.bind(this, this.onParamChanged));
		this.iconThemeChangedId = St.TextureCache.get_default().connect('icon-theme-changed', Lang.bind(this, this.onParamChanged));
		this.globalThemeChangedId = St.ThemeContext.get_for_stage(global.stage).connect('changed', Lang.bind(this, this.onParamChanged));
		if ((this.settings.get_boolean("display-tasks")) && (this.settings.get_boolean("blink-tasks")))
			this.windowDemandsAttentionId = global.display.connect('window-demands-attention', Lang.bind(this, this.onWindowDemandsAttention));
		//        if (Main.screenShield !== null)
		//            this.screenShieldLockId = Main.screenShield.connect('lock-status-changed', Lang.bind(this, this.onParamChanged));
		this.setOverview();
	},

	//TaskBar in Overview Mode
	setOverview: function() {
		if (!this.settings.get_boolean("overview")) {
			this.mainBox = this.boxMain;
			this.overviewHidingId = Main.overview.connect('hiding', Lang.bind(this, this.showMainBox));
			this.overviewShowingId = Main.overview.connect('showing', Lang.bind(this, this.hideMainBox));
		} else {
			//Disconnect Overview Signals
			if (this.overviewHidingId !== null) {
				Main.overview.disconnect(this.overviewHidingId);
				this.overviewHidingId = null;
			}
			if (this.overviewShowingId !== null) {
				Main.overview.disconnect(this.overviewShowingId);
				this.overviewShowingId = null;
			}
		}
	},

	//First Start
	firstStart: function() {
		if ((this.settings.get_string("extension-path") === 'unset') || (this.settings.get_string("extension-path") !== Extension.path)) {
			this.settings.set_string("extension-path", Extension.path);
			this.settings.set_string("desktop-button-icon", DESKTOPICON);
			this.settings.set_string("appview-button-icon", APPVIEWICON);
			this.settings.set_string("tray-button-icon", BPTRAYICON);
		}
		if ((this.settings.get_boolean("first-start")) && (Main.sessionMode.currentMode === 'user')) {
			//Comment out the next line to disable the preferences window from opening at the first start
			Util.spawnCommandLine('gnome-extensions prefs ' + Extension.metadata.uuid);
			this.settings.set_boolean("first-start", false);
		}
	},

	//Verify other Extensions
	otherExtensions: function() {
		//Find out if the bottom panel extension is enabled
		this.tbp = false;
		let schemaSettings = new Gio.Settings({
			schema: 'org.gnome.shell'
		});
		let enabled_extensions = schemaSettings.get_strv('enabled-extensions');
		if (enabled_extensions.indexOf("bottompanel@tmoer93") !== -1)
			this.tbp = true;
	},

	//Add TaskBar
	addTaskBar: function() {
		this.setTaskBar = false;
		if ((this.settings.get_boolean("display-tasks")) ||
			(this.settings.get_boolean("display-desktop-button")) ||
			(this.settings.get_boolean("display-workspace-button")) ||
			(this.settings.get_boolean("display-showapps-button")) ||
			(this.settings.get_boolean("display-favorites")) ||
			(this.settings.get_boolean("display-aggregate"))) {
			this.setTaskBar = true;
			this.boxMain = new St.BoxLayout({
				style_class: "tkb-box"
			});
			this.boxMainSystem = new St.BoxLayout({
				style_class: "tkb-box"
			});
			if (this.settings.get_boolean("display-favorites"))
				this.boxMainFavorites = new St.BoxLayout({
					style_class: "tkb-box-favorites"
				});
			if (this.settings.get_boolean("display-aggregate")) {
                                log("Add Aggregate Box ....");
			        this.boxMainAggregate = new St.BoxLayout({
				        style_class: "panel-status-indicators-box"
			        });
                        }
			if (this.settings.get_boolean("display-showapps-button"))
				this.boxMainShowAppsButton = new St.BoxLayout({
					style_class: "tkb-box"
				});
			if (this.settings.get_boolean("display-workspace-button"))
				this.boxMainWorkspaceButton = new St.BoxLayout({
					style_class: "tkb-box"
				});
			if (this.settings.get_boolean("display-desktop-button"))
				this.boxMainDesktopButton = new St.BoxLayout({
					style_class: "tkb-box"
				});
			if (this.settings.get_boolean("display-tasks")) {
				this.boxMainTasks = new St.BoxLayout({
					style_class: "tkb-box",
					reactive: true
				});
				this.tasksContainerWidth = this.settings.get_int("tasks-container-width-new");
				this.boxMainTasksId = this.boxMainTasks.connect("scroll-event", Lang.bind(this, this.onScrollTaskButton));
			}
			if ((this.settings.get_enum("tray-button") !== 0) && (this.settings.get_boolean("bottom-panel")) && (ShellVersion[1] <= 14))
				this.boxBottomPanelTrayButton = new St.BoxLayout({
					style_class: "tkb-box"
				});
		}
	},

	//Add Separators
	addSeparators: function() {
		if (this.setTaskBar) {
			let separatorLeftBoxMain = this.settings.get_int('separator-left-box-main');
			let separatorRightBoxMain = this.settings.get_int('separator-right-box-main');
			this.separatorBoxMain = 'padding-left: ' + separatorLeftBoxMain + 'px; padding-right: ' + separatorRightBoxMain + 'px; ';
			this.boxMain.set_style(this.separatorBoxMain);
			if (this.settings.get_boolean("display-favorites")) {
				let separatorLeftFavorites = this.settings.get_int('separator-left-favorites');
				let separatorRightFavorites = this.settings.get_int('separator-right-favorites');
				this.separatorFavorites = 'padding-left: ' + separatorLeftFavorites + 'px; padding-right: ' + separatorRightFavorites + 'px; ';
				this.boxMainFavorites.set_style(this.separatorFavorites);
			}
			if (this.settings.get_boolean("display-showapps-button")) {
				let separatorLeftAppview = this.settings.get_int('separator-left-appview');
				let separatorRightAppview = this.settings.get_int('separator-right-appview');
				this.separatorAppview = 'padding-left: ' + separatorLeftAppview + 'px; padding-right: ' + separatorRightAppview + 'px; ';
				this.boxMainShowAppsButton.set_style(this.separatorAppview);
			}
			if (this.settings.get_boolean("display-workspace-button")) {
				let separatorLeftWorkspaces = this.settings.get_int('separator-left-workspaces');
				let separatorRightWorkspaces = this.settings.get_int('separator-right-workspaces');
				this.separatorWorkspaces = 'padding-left: ' + separatorLeftWorkspaces + 'px; padding-right: ' + separatorRightWorkspaces + 'px; ';
				this.boxMainWorkspaceButton.set_style(this.separatorWorkspaces);
			}
			if (this.settings.get_boolean("display-desktop-button")) {
				let separatorLeftDesktop = this.settings.get_int('separator-left-desktop');
				let separatorRightDesktop = this.settings.get_int('separator-right-desktop');
				this.separatorDesktop = 'padding-left: ' + separatorLeftDesktop + 'px; padding-right: ' + separatorRightDesktop + 'px; ';
				this.boxMainDesktopButton.set_style(this.separatorDesktop);
			}
			if (this.settings.get_boolean("display-tasks")) {
				let separatorLeftTasks = this.settings.get_int('separator-left-tasks');
				let separatorRightTasks = this.settings.get_int('separator-right-tasks');
				this.separatorTasks = 'padding-left: ' + separatorLeftTasks + 'px; padding-right: ' + separatorRightTasks + 'px; ';
				this.boxMainTasks.set_style(this.separatorTasks);
			}
		}
	},

	//Export Settings
	exportSettings: function() {
		if (this.settings.get_boolean("export-settings")) {
			Util.spawnCommandLine('sh ' + Extension.path + '/scripts/export.sh');
			this.settings.set_boolean("export-settings", false);
		}
	},

	//Import Settings
	importSettings: function() {
		if (this.settings.get_boolean("import-settings")) {
			Util.spawnCommandLine('sh ' + Extension.path + '/scripts/import.sh');
			this.settings.set_boolean("import-settings", false);
		}
	},

	//Reset All !
	resetAll: function() {
		if (this.settings.get_boolean("reset-all")) {
			Util.spawnCommandLine('dconf reset -f /org/gnome/shell/extensions/TaskBar/');
		}
	},

	//Find Apps
	findApps: function() {
		if (this.settings.get_boolean("find-apps")) {
			Main.overview.show();
			Main.overview.viewSelector._showAppsButton.checked = true;
			this.settings.set_boolean("find-apps", false);
		}
	},

	//Keybindings
	keybindings: function() {
		if (Main.wm.addKeybinding && Shell.ActionMode) //3.16
			Main.wm.addKeybinding(PREVIOUSKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Shell.ActionMode.NORMAL,
				Lang.bind(this, this.keyPreviousTask));
		else if (Main.wm.addKeybinding && Shell.KeyBindingMode) //3.8
			Main.wm.addKeybinding(PREVIOUSKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY,
				Lang.bind(this, this.keyPreviousTask));
		else
			global.display.add_keybinding(PREVIOUSKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Lang.bind(this, this.keyPreviousTask));
		if (Main.wm.addKeybinding && Shell.ActionMode) //3.16
			Main.wm.addKeybinding(NEXTKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Shell.ActionMode.NORMAL,
				Lang.bind(this, this.keyNextTask));
		else if (Main.wm.addKeybinding && Shell.KeyBindingMode) //3.8
			Main.wm.addKeybinding(NEXTKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY,
				Lang.bind(this, this.keyNextTask));
		else
			global.display.add_keybinding(NEXTKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Lang.bind(this, this.keyNextTask));
		if (Main.wm.addKeybinding && Shell.ActionMode) //3.16
			Main.wm.addKeybinding(DESKTOPKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Shell.ActionMode.NORMAL,
				Lang.bind(this, this.keyToggleDesktop));
		else if (Main.wm.addKeybinding && Shell.KeyBindingMode) //3.8
			Main.wm.addKeybinding(DESKTOPKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY,
				Lang.bind(this, this.keyToggleDesktop));
		else
			global.display.add_keybinding(DESKTOPKEY, this.settings, Meta.KeyBindingFlags.NONE,
				Lang.bind(this, this.keyToggleDesktop));
	},

	//Keybinding Activate Previous Task
	keyPreviousTask: function() {
		this.previousTask = null;
		let focusWindow = global.display.focus_window;
		let activeWorkspace = global.workspace_manager.get_active_workspace();
		this.tasksList.forEach(
			function(task) {
				let [windowTask, buttonTask, signalsTask] = task;
				if ((windowTask === focusWindow) && (this.previousTask !== null)) {
					let [windowTask, buttonTask, signalsTask] = this.previousTask;
					let windowWorkspace = windowTask.get_workspace();
					if (windowWorkspace !== activeWorkspace)
						windowWorkspace.activate(global.get_current_time());
					windowTask.activate(global.get_current_time());
				}
				this.previousTask = task;
			},
			this
		);
		if (Main.overview.visible)
			Main.overview.hide();
	},

	//Keybinding Activate Next Task
	keyNextTask: function() {
		this.nextTask = false;
		let focusWindow = global.display.focus_window;
		let activeWorkspace = global.workspace_manager.get_active_workspace();
		this.tasksList.forEach(
			function(task) {
				let [windowTask, buttonTask, signalsTask] = task;
				let windowWorkspace = windowTask.get_workspace();
				if (this.nextTask) {
					if (windowWorkspace !== activeWorkspace)
						windowWorkspace.activate(global.get_current_time());
					windowTask.activate(global.get_current_time());
					this.nextTask = false;
				}
				if (windowTask === focusWindow)
					this.nextTask = true;
			},
			this
		);
		if (Main.overview.visible)
			Main.overview.hide();
	},

	//Keybinding Toggle Desktop
	keyToggleDesktop: function() {
		let maxWindows = false;
		let userTime = null;
		let activeWorkspace = global.workspace_manager.get_active_workspace();
		let windows = activeWorkspace.list_windows().filter(function(w) {
			return w.get_window_type() !== Meta.WindowType.DESKTOP;
		});
		for (let i = 0; i < windows.length; ++i) {
			if ((this.desktopView) && (!Main.overview.visible)) {
				userTime = windows[i].user_time;
				if (userTime > this.lastFocusedWindowUserTime) {
					this.lastFocusedWindowUserTime = userTime;
					this.lastFocusedWindow = windows[i];
				}
				windows[i].unminimize();
				maxWindows = true;
			} else {
				windows[i].minimize();
			}
		}
		if (maxWindows) {
			this.lastFocusedWindow.activate(global.get_current_time());
		}
		this.desktopView = !this.desktopView;
		if (Main.overview.visible)
			Main.overview.hide();
	},

	//Align Position
	onPositionChanged: function() {
		this.showTray = null;
		this.messageTrayShowingId = null;
		this.messageTrayHidingId = null;
		this.setAnchorPoint = false;
		this.bottomPanelEndIndicator = false;
		if (this.setTaskBar) {
			if (this.settings.get_boolean("bottom-panel"))
				this.bottomPanel();
			else {
				this.defineBoxChanged();
				this.panelPosition = this.settings.get_int('panel-position');
				if (this.panelPosition > this.pbchildren)
					this.settings.set_int("panel-position", this.pbchildren);
				this.newBox.insert_child_at_index(this.boxMain, this.panelPosition);
			}
		}
	},

	defineBoxChanged: function() {
		this.panelBox = this.settings.get_int('panel-box');
		if (this.panelBox === 1)
			this.newBox = Main.panel._leftBox;
		else if (this.panelBox === 2)
			this.newBox = Main.panel._centerBox;
		else if (this.panelBox === 3)
			this.newBox = Main.panel._rightBox;
		this.pbchildren = this.newBox.get_children().length;
		let positionMaxRight = this.settings.get_int("position-max-right");
		if (positionMaxRight !== this.pbchildren)
			this.settings.set_int("position-max-right", this.pbchildren);
	},

	onBoxChanged: function() {
		this.newBox.remove_child(this.boxMain);
		this.defineBoxChanged();
	},

	appearanceOrder: function() {
                log("Show Main Box appearanceOrder");
		if (this.setTaskBar) {
                        log("Show Main Box In TasBar appearanceOrder");
			this.appearances = [
				("position-tasks"),
				("position-desktop-button"),
				("position-workspace-button"),
				("position-appview-button"),
				("position-favorites")
			];
			for (let i = 0; i <= 4; i++) {
                                log("Show Main Box In TasBar appearanceOrder [" + i + "]");
				this.appearances.forEach(
					function(appearance) {
                                                log("Show Main Box In TasBar appearanceOrder [" + i + "|" + appearance  + "]");
						let positionAppearance = this.settings.get_int(appearance);
                                                log("Show Main Box In TasBar appearanceOrder [" + i + "|" + appearance + " (" + positionAppearance + "==" + i + ") ]");
						if (positionAppearance === i) {
                                                        log("Show Box Aggregate [" + appearance + "] FOUND");
							if ((appearance === "position-tasks") && (this.settings.get_boolean("display-tasks")))
								this.boxMain.add_actor(this.boxMainTasks);
							else if ((appearance === "position-desktop-button") && (this.settings.get_boolean("display-desktop-button")))
								this.boxMain.add_actor(this.boxMainDesktopButton);
							else if ((appearance === "position-workspace-button") && (this.settings.get_boolean("display-workspace-button")))
								this.boxMain.add_actor(this.boxMainWorkspaceButton);
							else if ((appearance === "position-appview-button") && (this.settings.get_boolean("display-showapps-button")))
								this.boxMain.add_actor(this.boxMainShowAppsButton);
							else if ((appearance === "position-favorites") && (this.settings.get_boolean("display-favorites")))
								this.boxMain.add_actor(this.boxMainFavorites);
						}
					},
					this
				);
			}
		        if (this.settings.get_boolean("display-aggregate")) {
                              log("Show Box Aggregate 1");
			      this.boxMainSystem.add_actor(this.boxMainAggregate);
                              log("Show Box Aggregate 2");
                        }
			if ((this.settings.get_enum("tray-button") !== 0) && (this.bottomPanelEndIndicator) && (ShellVersion[1] <= 14))
				this.boxMain.add_actor(this.boxBottomPanelTrayButton);
		}
	},

	//Appearance Position changed
	appearancePositionChange: function() {
		if (this.settings.get_boolean("position-changed")) {
			this.settings.set_boolean("position-changed", false);
			this.onParamChanged();
		}
	},

	//Hide TaskBar in Overview
	showMainBox: function() {
		this.mainBox.show();
		if ((this.settings.get_enum("tray-button") !== 0) && (!this.bottomPanelEndIndicator) && (this.settings.get_boolean("bottom-panel")) && (ShellVersion[1] <= 14))
			this.boxBottomPanelTrayButton.show();
	},

	hideMainBox: function() {
		this.mainBox.hide();
		if ((this.settings.get_enum("tray-button") !== 0) && (!this.bottomPanelEndIndicator) && (this.settings.get_boolean("bottom-panel")) && (ShellVersion[1] <= 14))
			this.boxBottomPanelTrayButton.hide();
	},

	workspaceSwitched: function() {
                let index = global.workspace_manager.get_active_workspace().index();
                this.favoriteAppSelected(index);
	},

        favoriteAppSelected: function(i) {
		for (let x = 0; x < this.labelFavorites.length; x++) {
		    if (x == i) {
		         this.selectedFavorites[x] = true;
                         this.labelFavorites[x].remove_style_class_name('tkb-tasklabel-favorite');
                         this.labelFavorites[x].set_style_class_name('tkb-tasklabel-favorite-selected');
		         let icon_name = this.iconNameFavorites[x].slice(0, -4);
		         let gicon = Gio.Icon.new_for_string(icon_name);
		         this.iconFavorites[x].set_gicon(gicon);
                         if (x == (this.labelFavorites.length -  1)) {
                               this.boxFavorites[x].remove_style_class_name("tkb-box-favorite-last");
                               this.boxFavorites[x].set_style_class_name("tkb-box-favorite-last-selected");
                         }
			 else {
                               this.boxFavorites[x].remove_style_class_name("tkb-box-favorite");
                               this.boxFavorites[x].set_style_class_name("tkb-box-favorite-selected");
			 }
		    }
		    else if (this.selectedFavorites[x] == true) {
		         this.selectedFavorites[x] = false;
                         this.labelFavorites[x].remove_style_class_name('tkb-tasklabel-favorite-selected');
                         this.labelFavorites[x].set_style_class_name('tkb-tasklabel-favorite');
		         let gicon = Gio.Icon.new_for_string(this.iconNameFavorites[x]);
		         this.iconFavorites[x].set_gicon(gicon);
                         if (x == (this.labelFavorites.length -  1)) {
                               this.boxFavorites[x].remove_style_class_name("tkb-box-favorite-last-selected");
                               this.boxFavorites[x].set_style_class_name("tkb-box-favorite-last");
                         }
			 else {
                               this.boxFavorites[x].remove_style_class_name("tkb-box-favorite-selected");
                               this.boxFavorites[x].set_style_class_name("tkb-box-favorite");
			 }
		    }
		}
        },

	//Add Favorites
	addFavorites: function(buttonfavorite, favoriteapp) {
                this.installedChangedId = null;
                this.changedId = null;
                if (this.settings.get_boolean("display-favorites")) {
                        //Connect Favorites Changes
			this.conn = Gio.DBus.session;
                        this.installedChangedId = Shell.AppSystem.get_default().connect('installed-changed', Lang.bind(this, this.onParamChanged));
                        this.changedId = AppFavorites.getAppFavorites().connect('changed', Lang.bind(this, this.onParamChanged));

                        let favorites = global.settings.get_strv(AppFavorites.getAppFavorites().FAVORITE_APPS_KEY);
                        for (let i = 0; i < favorites.length; ++i) {
                                let favoriteapp = Shell.AppSystem.get_default().lookup_app(favorites[i]);
                                if (favoriteapp === null) {
                                        continue;
                                }
                                let appInfo = Gio.DesktopAppInfo.new(favoriteapp.get_id())
				let label = "";
				this.favoriteSelected[favoriteapp.get_name()] = false;
                                let boxFavorite = new St.BoxLayout({
			            x_align: St.Align.MIDDLE,
                                    vertical: true,
                                    height: 78,
				    reactive: true,
                                    track_hover: true
                                });
                                if (i == (favorites.length -  1))
                                    boxFavorite.set_style_class_name("tkb-box-favorite-last");
				else
                                    boxFavorite.set_style_class_name("tkb-box-favorite");
                                let buttonboxfavorite = new St.BoxLayout({
			            x_align: St.Align.MIDDLE,
                                    vertical: true,
                                    height: 68,
                                });
                                if (i == 0)
                                    buttonboxfavorite.set_style_class_name("tkb-task-favorite-first");
				else
                                    buttonboxfavorite.set_style_class_name("tkb-task-favorite");
				boxFavorite.add_child(buttonboxfavorite);
				let iconFavorite = new St.Icon({
					icon_name: appInfo.get_string('Icon'),
					icon_size: 50
				});
                                buttonboxfavorite.add_child(iconFavorite);
				let labeltmp = appInfo.get_string('X-ORDISSIMO-Name');
                                if (labeltmp)
				    label = labeltmp;
				else
				    label = favoriteapp.get_name();
                                let labelfavorite = new St.Label({
			            y_align: St.Align.END,
				    text: label
				});
                                labelfavorite.set_style_class_name('tkb-tasklabel-favorite');

				this.boxFavorites[i] = boxFavorite;
				this.iconFavorites[i] = iconFavorite;
				this.iconNameFavorites[i] = appInfo.get_string('Icon');
				this.labelFavorites[i] = labelfavorite;
				this.selectedFavorites[i] = false;
                                buttonboxfavorite.add_child(labelfavorite);
				boxFavorite.set_track_hover(true);
				boxFavorite.connect('button-release-event', Lang.bind(this, function() {
                                        this.conn.call(
                                            'com.ordissimo.Exec',
                                            '/com/ordissimo/Exec',
                                            'com.ordissimo.Exec',
                                            'desktop',
                                            new GLib.Variant('(s)', [favoriteapp.get_id()]),
                                            null,
                                            Gio.DBusCallFlags.NONE,
                                            -1,
                                            null,
                                            (con, res) => {
                                                 try {
                                                    let reply = con.call_finish(res);
                                                 } catch (e) {
                                                    logError(e);
                                                 }
                                            }
                                        );
                                        this.favoriteAppSelected(i);
				}, favoriteapp, appInfo, favorites, this, i));
                                this.boxMainFavorites.add_actor(boxFavorite);
                        }
                        Main.wm.actionMoveWorkspace(global.workspace_manager.get_workspace_by_index(0));
                        this.favoriteAppSelected(0);
                }
	},

	//Add Aggegate
	addAggregate: function(buttonaggregate, aggregateapp) {
		if (this.settings.get_boolean("display-aggregate")) {
                       
                        // this.addToStatusArea(calendar.name, calendar, 0, this.boxMainAggregate);
                        this.addToStatusArea(power.name, power, 0, this.boxMainAggregate);
                        this.addToStatusArea(light.name, light, 0, this.boxMainAggregate);
                        this.addToStatusArea(volume.name, volume, 0, this.boxMainAggregate);
                        this.addToStatusArea(network.name, network, 0, this.boxMainAggregate);
                }
       },

       _addToPanelBox: function(role, indicator, position, box) {
            let container = indicator.container;
            container.show();

            let parent = container.get_parent();
            if (parent)
                 parent.remove_actor(container);


            box.insert_child_at_index(container, position);
            if (indicator.menu)
                 this.menuManager.addMenu(indicator.menu);
            this.statusArea[role] = indicator;
            let destroyId = indicator.connect('destroy', emitter => {
                 delete this.statusArea[role];
                 emitter.disconnect(destroyId);
            });
            indicator.connect('menu-set', this._onMenuSet.bind(this));
            this._onMenuSet(indicator);
       },

       addToStatusArea: function(role, indicator, position, box) {
            if (this.statusArea[role])
                throw new Error('Extension point conflict: there is already a status indicator for role %s'.format(role));

            if (!(indicator instanceof PanelMenu.Button))
                throw new TypeError('Status indicator must be an instance of PanelMenu.Button');

            position = position || 0;
            this.statusArea[role] = indicator;
            this._addToPanelBox(role, indicator, position, box);
            return indicator;
       },

        _onMenuSet: function(indicator) {
            if (!indicator.menu || indicator.menu._openChangedId)
                return;

            indicator.menu._openChangedId = indicator.menu.connect('open-state-changed',
                (menu, isOpen) => {
                    if (Clutter.ActorAlign.END == Main.messageTray.bannerAlignment)
                        Main.messageTray.bannerBlocked = isOpen;
            });
        },

	//Add Appview Button
	addShowAppsButton: function() {
		if (this.settings.get_boolean("display-showapps-button")) {
			let iconPath = this.settings.get_string("appview-button-icon");
			if (iconPath === 'unset')
				iconPath = APPVIEWICON;
			this.showAppsIcon = Gio.icon_new_for_string(iconPath);
			this.iconShowApps = new St.Icon({
				gicon: this.showAppsIcon,
				icon_size: (this.panelSize),
				style_class: "tkb-desktop-icon"
			});
			this.buttonShowApps = new St.Button({
				style_class: "tkb-task-button"
			});
			this.signalShowApps = this.buttonShowApps.connect("button-press-event", Lang.bind(this, this.onClickShowAppsButton));
			this.buttonShowApps.set_child(this.iconShowApps);
			this.boxShowApps = new St.BoxLayout({
				style_class: "tkb-desktop-box"
			});
			this.boxShowApps.add_actor(this.buttonShowApps);
			this.boxMainShowAppsButton.add_actor(this.boxShowApps);
		}
	},

	//Add Workspace Button
	addWorkspaceButton: function() {
		this.workspaceSwitchedId = null;
		this.nWorkspacesId = null;
		if (this.settings.get_boolean("display-workspace-button")) {
			//Connect Workspace Changes
			this.workspaceSwitchedId = global.workspace_manager.connect('workspace-switched', Lang.bind(this, this.updateWorkspaces));
			this.nWorkspacesId = global.workspace_manager.connect('notify::n-workspaces', Lang.bind(this, this.updateWorkspaces));
			this.buttonWorkspace = new St.Button({
				style_class: "tkb-task-button"
			});
			this.buttonWorkspace.connect("button-press-event", Lang.bind(this, this.onClickWorkspaceButton));
			this.buttonWorkspace.connect("scroll-event", Lang.bind(this, this.onScrollWorkspaceButton));
			this.workspaceButtonColor = this.settings.get_string("workspace-button-color");
			this.displayWorkspaceButtonColor = this.settings.get_boolean("display-workspace-button-color");
			if ((this.workspaceButtonColor !== "unset") && (this.displayWorkspaceButtonColor)) {
				this.workspaceButtonStyle = "color: " + this.workspaceButtonColor + ";";
				this.buttonWorkspace.set_style(this.workspaceButtonStyle);
			}
			this.updateWorkspaces();
			this.boxWorkspace = new St.BoxLayout({
				style_class: "tkb-desktop-box"
			});
			this.boxWorkspace.add_actor(this.buttonWorkspace);
			this.boxMainWorkspaceButton.add_actor(this.boxWorkspace);
		}
	},

	updateWorkspaces: function() {
		this.activeWorkspaceIndex = global.workspace_manager.get_active_workspace().index();
		let workspaceButtonWidth = this.settings.get_int("workspace-button-width");
		this.totalWorkspace = global.workspace_manager.n_workspaces - 1;
		let labelWorkspaceIndex = this.activeWorkspaceIndex + 1;
		let labelTotalWorkspace = this.totalWorkspace + 1;
		if (this.settings.get_enum("workspace-button-index") === 1) {
			this.labelWorkspace = new St.Label({
				text: (labelWorkspaceIndex + "/" + labelTotalWorkspace)
			});
			this.labelWorkspace.set_width((this.panelSize * 2) + 2 + this.adjustTBLabelSize - this.adjustTBIconSize + workspaceButtonWidth);
		} else if (this.settings.get_enum("workspace-button-index") === 0) {
			this.labelWorkspace = new St.Label({
				text: (labelWorkspaceIndex + "")
			});
			this.labelWorkspace.set_width(this.panelSize - 2 + this.adjustTBLabelSize - this.adjustTBIconSize + workspaceButtonWidth);
		}
		this.labelWorkspace.style = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px' + '; text-align: center;';
		this.buttonWorkspace.set_child(this.labelWorkspace);
	},

	//Add Desktop Button
	addDesktopButton: function() {
		if (this.settings.get_boolean("display-desktop-button")) {
			let iconPath = this.settings.get_string("desktop-button-icon");
			if (iconPath === 'unset')
				iconPath = DESKTOPICON;
			this.desktopButtonIcon = Gio.icon_new_for_string(iconPath);
			let iconDesktop = new St.Icon({
				gicon: this.desktopButtonIcon,
				icon_size: (this.panelSize),
				style_class: "tkb-desktop-icon"
			});
			let buttonDesktop = new St.Button({
				style_class: "tkb-task-button"
			});
			let signalDesktop = buttonDesktop.connect("button-press-event", Lang.bind(this, this.onClickDesktopButton));
			buttonDesktop.set_child(iconDesktop);
			let boxDesktop = new St.BoxLayout({
				style_class: "tkb-desktop-box"
			});
			boxDesktop.add_actor(buttonDesktop);
			this.boxMainDesktopButton.add_actor(boxDesktop);
		}
	},

	//Add Tray Button
	addTrayButton: function() {
		this.messageTrayCountAddedId = null;
		this.messageTrayCountRemovedId = null;
		if ((this.settings.get_boolean("bottom-panel")) && (this.settings.get_enum("tray-button") !== 0) && (ShellVersion[1] <= 14)) {
			this.buttonTray = new St.Button({
				style_class: "tkb-task-button"
			});
			this.signalTray = [
				this.buttonTray.connect("button-press-event", Lang.bind(this, this.onClickTrayButton)),
				this.buttonTray.connect("enter-event", Lang.bind(this, this.onHoverTrayButton))
			];
			if ((this.settings.get_enum("tray-button") === 1) && (this.settings.get_enum("tray-button-empty") === 0))
				this.messageTrayIcon();
			else {
				this.messageTrayCountAddedId = Main.messageTray.connect('source-added', Lang.bind(this, this.messageTrayCount));
				this.messageTrayCountRemovedId = Main.messageTray.connect('source-removed', Lang.bind(this, this.messageTrayCount));
				this.messageTrayCount();
			}
		}
	},

	messageTrayCount: function() {
		let indicatorCount = 0;
		indicatorCount = Main.messageTray.getSources().length;
		if (((indicatorCount === 0) && (this.settings.get_enum("tray-button-empty") === 0)) ||
			((indicatorCount !== 0) && (this.settings.get_enum("tray-button-empty") === 1) && (this.settings.get_enum("tray-button") !== 2)) ||
			((indicatorCount !== 0) && (this.settings.get_enum("tray-button") === 1)))
			this.messageTrayIcon();
		else {
			if ((indicatorCount === 0) && (this.settings.get_enum("tray-button-empty") === 2))
				this.labelTray = new St.Label();
			else
				this.labelTray = new St.Label({
					text: (indicatorCount + '')
				});
			this.buttonTray.set_child(this.labelTray);
			this.boxTray = new St.BoxLayout({
				style_class: "tkb-desktop-box"
			});
			this.boxTray.add_actor(this.buttonTray);
			this.boxBottomPanelTrayButton.add_actor(this.boxTray);
		}
	},

	messageTrayIcon: function() {
		let iconPath = this.settings.get_string("tray-button-icon");
		if (iconPath === 'unset')
			iconPath = BPTRAYICON;
		this.trayIcon = Gio.icon_new_for_string(iconPath);
		this.iconTray = new St.Icon({
			gicon: this.trayIcon,
			icon_size: (this.panelSize),
			style_class: "tkb-desktop-icon"
		});
		this.buttonTray.set_child(this.iconTray);
		this.boxTray = new St.BoxLayout({
			style_class: "tkb-desktop-box"
		});
		this.boxTray.add_actor(this.buttonTray);
		this.boxBottomPanelTrayButton.add_actor(this.boxTray);
	},

	//Activities Button
	displayActivities: function() {
		this.initDisplayActivitiesButton();
		if (this.settings.get_boolean("activities-button"))
			this.activitiesContainer.show();
	},

	initDisplayActivitiesButton: function() {
		if (!this.settings.get_boolean("activities-button")) {
			this.activitiesContainer = Main.panel.statusArea.activities.container;
			this.activitiesContainer.hide();
		}
		this.activitiesColor = this.settings.get_string("activities-button-color");
		if (this.activitiesColor !== "unset")
			this.colorActivities();
	},

	colorActivities: function() {
		this.activitiesColor = this.settings.get_string("activities-button-color");
		if (this.activitiesColor !== "unset") {
			this.activitiesStyle = "color: " + this.activitiesColor + ";";
			Main.panel.statusArea.activities.set_style(this.activitiesStyle);
		} else
			Main.panel.statusArea.activities.set_style("None");
	},

	//Top Panel
	displayTopPanel: function() {
		this.initDisplayTopPanel();
		if (this.settings.get_boolean("top-panel")) {
			Main.layoutManager.removeChrome(Main.layoutManager.panelBox);
			Main.layoutManager.addChrome(Main.layoutManager.panelBox, {
				affectsStruts: true
			});
			Main.panel.show();
			Main.panel._leftCorner.show();
			Main.panel._rightCorner.show();
			this.onParamChanged();
		}
	},

	initDisplayTopPanel: function() {
		if (!this.settings.get_boolean("top-panel")) {
			Main.layoutManager.removeChrome(Main.layoutManager.panelBox);
			Main.layoutManager.addChrome(Main.layoutManager.panelBox, {
				affectsStruts: false
			});
			Main.panel.hide();
			Main.panel._leftCorner.hide();
			Main.panel._rightCorner.hide();
		}
	},

	//Hot Corner
	enableHotCorner: function() {
        if (ShellVersion[1] < 26) {
		    this.initEnableHotCorner();
		    if (this.settings.get_boolean("hot-corner")) {
			    Main.layoutManager._updateHotCorners();
		    }
        }
	},

	initEnableHotCorner: function() {
		if ((!this.settings.get_boolean("hot-corner")) && (ShellVersion[1] < 26)) {
			Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex]._toggleOverview = function() {};
			Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex]._pressureBarrier._trigger = function() {};
		}
	},

	//Application Menu
	displayApplicationMenu: function() {
		this.initDisplayApplicationMenu();
		if (this.settings.get_boolean("application-menu")) {
			let variant = GLib.Variant.new('a{sv}', {
				'Gtk/ShellShowsAppMenu': GLib.Variant.new('i', 1)
			});
			let xsettings = new Gio.Settings({
				schema: 'org.gnome.settings-daemon.plugins.xsettings'
			});
			xsettings.set_value('overrides', variant);
			this.appMenuContainer.show();
			Shell.WindowTracker.get_default().disconnect(this.hidingId2);
			Main.overview.disconnect(this.hidingId);
		}
	},

	initDisplayApplicationMenu: function() {
		this.appMenuContainer = Main.panel.statusArea.appMenu.container;
		if (!this.settings.get_boolean("application-menu")) {
			this.appMenuContainer.hide();
			this.hidingId = Main.overview.connect('hiding', function() {
				Main.panel.statusArea.appMenu.container.hide();
			});
			this.hidingId2 = Shell.WindowTracker.get_default().connect('notify::focus-app', function() {
				Main.panel.statusArea.appMenu.container.hide();
			});
		}
		this.appMenuColor = this.settings.get_string("application-menu-color");
		if (this.appMenuColor !== "unset")
			this.colorApplicationMenu();
	},

	colorApplicationMenu: function() {
		this.appMenuColor = this.settings.get_string("application-menu-color");
		if (this.appMenuColor !== "unset") {
			this.appMenuStyle = "color: " + this.appMenuColor + ";";
			Main.panel.statusArea.appMenu.set_style(this.appMenuStyle);
		} else
			Main.panel.statusArea.appMenu.set_style("None");
	},


	//Date Menu
	displayDateMenu: function() {
		this.initDisplayDateMenu();
		if (this.settings.get_boolean("date-menu"))
			this.dateMenuContainer.show();
	},

	initDisplayDateMenu: function() {
		if (!this.settings.get_boolean("date-menu")) {
			this.dateMenuContainer = Main.panel.statusArea.dateMenu.container;
			this.dateMenuContainer.hide();
		}
		this.dateMenuColor = this.settings.get_string("date-menu-color");
		if (this.dateMenuColor !== "unset")
			this.colorDateMenu();
	},

	colorDateMenu: function() {
		this.dateMenuColor = this.settings.get_string("date-menu-color");
		if (this.dateMenuColor !== "unset") {
			this.dateMenuStyle = "color: " + this.dateMenuColor + ";";
			Main.panel.statusArea.dateMenu.set_style(this.dateMenuStyle);
		} else
			Main.panel.statusArea.dateMenu.set_style("None");
	},

	//System Menu
	displaySystemMenu: function() {
		this.initDisplaySystemMenu();
		if (this.settings.get_boolean("system-menu"))
			this.systemMenuContainer.show();
	},

	initDisplaySystemMenu: function() {
		if (!this.settings.get_boolean("system-menu")) {
                        this.systemMenuContainer = Main.panel.statusArea.aggregateMenu.container;
			this.systemMenuContainer.hide();
		}
		this.systemMenuColor = this.settings.get_string("system-menu-color");
		if (this.systemMenuColor !== "unset")
			this.colorSystemMenu();
	},

	colorSystemMenu: function() {
		this.systemMenuColor = this.settings.get_string("system-menu-color");
		if (this.systemMenuColor !== "unset") {
			this.systemMenuStyle = "color: " + this.systemMenuColor + ";";
			Main.panel.statusArea.aggregateMenu.set_style(this.systemMenuStyle);
		} else
			Main.panel.statusArea.aggregateMenu.set_style("None");
	},

	//Dash
	displayDash: function() {
		this.initDisplayDash();
		if (this.settings.get_boolean("dash")) {
			this.dash.set_height(this.dashHeight);
			this.dash.set_width(this.dashWidth);
		}
	},

	initDisplayDash: function() {
		if (!this.settings.get_boolean("dash")) {
			this.dash = Main.overview.dash;
			this.dashHeight = this.dash.get_height();
			this.dashWidth = this.dash.get_width();
			this.dash.set_height(0);
			this.dash.set_width(0);
		}
	},

	//Workspace Selector
	displayWorkspaceSelector: function() {
		this.initDisplayWorkspaceSelector();
		if (this.settings.get_boolean("workspace-selector")) {
			ThumbnailsSlider._getAlwaysZoomOut = this.alwaysZoomOut;
			ThumbnailsSlider.getNonExpandedWidth = this.nonExpandedWidth;
		}
	},

	initDisplayWorkspaceSelector: function() {
		if (!this.settings.get_boolean("workspace-selector")) {
			this.alwaysZoomOut = ThumbnailsSlider._getAlwaysZoomOut;
			this.nonExpandedWidth = ThumbnailsSlider.getNonExpandedWidth;
			ThumbnailsSlider._getAlwaysZoomOut = function() {
				return false;
			}
			ThumbnailsSlider.getNonExpandedWidth = function() {
				return 0;
			}
		}
	},


	//Preferences Hover Component Event
	hoverEvent: function() {
		this.hoverComponent = this.settings.get_int("hover-event");
		this.hoverStyle = "background-color: red; border-radius: 5px";
		if ((this.hoverComponent === 1) && (this.settings.get_boolean("display-tasks")))
			this.boxMainTasks.set_style(this.separatorTasks + this.hoverStyle);
		else if ((this.hoverComponent === 2) && (this.settings.get_boolean("display-desktop-button")))
			this.boxMainDesktopButton.set_style(this.separatorDesktop + this.hoverStyle);
		else if ((this.hoverComponent === 3) && (this.settings.get_boolean("display-workspace-button")))
			this.boxMainWorkspaceButton.set_style(this.separatorWorkspaces + this.hoverStyle);
		else if ((this.hoverComponent === 4) && (this.settings.get_boolean("display-showapps-button")))
			this.boxMainShowAppsButton.set_style(this.separatorAppview + this.hoverStyle);
		else if ((this.hoverComponent === 5) && (this.settings.get_boolean("display-favorites")))
			this.boxMainFavorites.set_style(this.separatorFavorites + this.hoverStyle);
		else if (this.hoverComponent === 0) {
			if (this.settings.get_boolean("display-tasks"))
				this.boxMainTasks.set_style(this.separatorTasks);
			if (this.settings.get_boolean("display-desktop-button"))
				this.boxMainDesktopButton.set_style(this.separatorDesktop);
			if (this.settings.get_boolean("display-workspace-button"))
				this.boxMainWorkspaceButton.set_style(this.separatorWorkspaces);
			if (this.settings.get_boolean("display-showapps-button"))
				this.boxMainShowAppsButton.set_style(this.separatorAppview);
			if (this.settings.get_boolean("display-favorites"))
				this.boxMainFavorites.set_style(this.separatorFavorites);
		}
	        //if (this.settings.get_boolean("display-aggregate"))
		        this.boxMainAggregate.set_style(this.separatorAggregate);
	},

	//Active Task Frame / Background Color
	activeTaskFrame: function() {
		this.backgroundColor = this.settings.get_string("active-task-background-color");
		this.activeTasksFrameColor = this.settings.get_string("tasks-frame-color");
		this.margin = this.settings.get_int("tasks-spaces");
		this.backgroundStyleColor = "border-radius: 5px;";
		if (this.settings.get_boolean("active-task-background-color-set"))
			this.backgroundStyleColor += "background-color: " + this.backgroundColor + "; ";
		if ((this.settings.get_boolean("active-task-frame")) && (this.settings.get_boolean("display-tasks-frame-color")))
			this.backgroundStyleColor += "border: 1px " + this.activeTasksFrameColor + "; background-image: url('" + Extension.path + "/images/active-task-background.svg'); ";
		else if ((this.settings.get_boolean("active-task-frame")) && (!this.settings.get_boolean("display-tasks-frame-color")))
			this.backgroundStyleColor += "border: 1px solid gray; background-image: url('" + Extension.path + "/images/active-task-background.svg'); ";
		if (this.settings.get_int("tasks-spaces") !== 0)
			this.backgroundStyleColor += "margin-right: " + this.margin + "px;";
	},

	//Inactive Task Frame / Background Color
	inactiveTaskFrame: function() {
		this.inactiveBackgroundColor = this.settings.get_string("inactive-task-background-color");
		this.inactiveTasksFrameColor = this.settings.get_string("inactive-tasks-frame-color");
		this.inactiveMargin = this.settings.get_int("tasks-spaces");
		this.inactiveBackgroundStyleColor = "border-radius: 5px; ";
		if (this.settings.get_boolean("inactive-task-background-color-set"))
			this.inactiveBackgroundStyleColor += "background-color: " + this.inactiveBackgroundColor + "; ";
		if ((this.settings.get_boolean("inactive-task-frame")) && (this.settings.get_boolean("display-inactive-tasks-frame-color")))
			this.inactiveBackgroundStyleColor += "border: 1px " + this.inactiveTasksFrameColor + "; background-image: url('" + Extension.path + "/images/active-task-background.svg'); ";
		else if ((this.settings.get_boolean("inactive-task-frame")) && (!this.settings.get_boolean("display-inactive-tasks-frame-color")))
			this.inactiveBackgroundStyleColor += "border: 1px solid gray; background-image: url('" + Extension.path + "/images/active-task-background.svg'); ";
		if (this.settings.get_int("tasks-spaces") !== 0)
			this.inactiveBackgroundStyleColor += "margin-right: " + this.inactiveMargin + "px;";
	},

	//Top Panel Background Color and (Font) Size
	changeTopPanelBackgroundColor: function() {
		this.panelSize = this.settings.get_int('panel-size');
		this.adjustTBIconSize = this.settings.get_int('tb-icon-size');
		this.adjustTBLabelSize = this.settings.get_int('tb-label-size');
		this.adjustContentSize = this.settings.get_int('content-size');
		this.panelSet = false;
		this.originalTopPanelStyle = Main.panel.get_style();
		this.originalLeftPanelCornerStyle = Main.panel._leftCorner.get_style();
		this.originalRightPanelCornerStyle = Main.panel._rightCorner.get_style();
		//Get Native Panel Background Color
		let tpobc = Main.panel.get_theme_node().get_background_color();
		let topPanelOriginalBackgroundColor = 'rgba(%d, %d, %d, %d)'.format(tpobc.red, tpobc.green, tpobc.blue, tpobc.alpha);
		this.settings.set_string("top-panel-original-background-color", topPanelOriginalBackgroundColor);
		this.bottomPanelBackgroundColor = this.settings.get_string("bottom-panel-background-color");
		if (this.bottomPanelBackgroundColor === 'unset') {
			this.settings.set_string("bottom-panel-original-background-color", topPanelOriginalBackgroundColor);
		}
		if ((this.panelSize !== 27) || (this.adjustContentSize !== 0)) {
			//Set Font Size
			this.panelLabelSize = (this.panelSize - 12 + this.adjustContentSize);
			this.fontSize = 'font-size: ' + this.panelLabelSize + 'px; height: ' + this.panelSize + 'px;';
			Main.panel.set_style(this.fontSize);
			this.panelSet = true;
		}
		this.topPanelBackgroundColor = this.settings.get_string("top-panel-background-color");
		if (this.topPanelBackgroundColor !== 'unset') {
			this.topPanelBackgroundStyle = "background-color: " + this.topPanelBackgroundColor + ";";
			this.panelLabelSize = (this.panelSize - 12 + this.adjustContentSize);
			this.fontSize = 'font-size: ' + this.panelLabelSize + 'px; height: ' + this.panelSize + 'px;';
			Main.panel.set_style(this.fontSize + ' ' + this.topPanelBackgroundStyle);
			if ((this.settings.get_boolean("top-panel-background-alpha")) && (ShellVersion[1] <= 16)) {
				Main.panel._leftCorner.hide();
				Main.panel._rightCorner.hide();
			} else {
				if (ShellVersion[1] <= 16) {
					Main.panel._leftCorner.show();
					Main.panel._rightCorner.show();
				}
				Main.panel._leftCorner.set_style('-panel-corner-background-color: ' + this.topPanelBackgroundColor + ';');
				Main.panel._rightCorner.set_style('-panel-corner-background-color: ' + this.topPanelBackgroundColor + ';');
			}
			this.panelSet = true;
		}
		this.panelSize = ((this.settings.get_int('panel-size')) - 6 + (this.settings.get_int('tb-icon-size')));
	},

	//Bottom Panel
	bottomPanel: function() {
		this.adjustTBIconSize = this.settings.get_int('tb-icon-size-bottom');
		this.adjustTBLabelSize = this.settings.get_int('tb-label-size-bottom');
		this.adjustContentSize = 0;
		let bottomPanelHeight = null;
		let newShowTray = null;
		this.panelSize = this.settings.get_int('panel-size-bottom');
		this.panelLabelSize = (this.panelSize - 12 + this.adjustTBLabelSize);
		this.fontSize = 'font-size: ' + this.panelLabelSize + 'px; height: ' + this.panelSize + 'px;';
		this.bottomPanelVertical = this.settings.get_int('bottom-panel-vertical');
		this.bottomPanelBackgroundColor = this.settings.get_string("bottom-panel-background-color");
		if (this.bottomPanelBackgroundColor === "unset")
			this.bottomPanelBackgroundColor = this.settings.get_string("bottom-panel-original-background-color");
		this.bottomPanelBackgroundStyle = "background-color: " + this.bottomPanelBackgroundColor + ";";
		this.bottomPanelActor = new St.BoxLayout({
			name: 'bottomPanel'
		});
		this.bottomPanelActor.set_style(this.fontSize + ' ' + this.bottomPanelBackgroundStyle);
		this.bottomPanelActor.set_reactive(false);
		this.positionBoxBottomStart = new St.Bin({
			x_expand: true,
			x_align: St.Align.START
		});
		this.positionBoxBottomMiddle = new St.Bin({
			x_expand: true,
			x_align: St.Align.MIDDLE
		});
		this.positionBoxBottomEnd = new St.Bin({
			x_expand: true,
			x_align: St.Align.END
		});
		this.positionBoxBottomSystem = new St.Bin({
			x_expand: false,
			x_align: St.Align.END
		});
		this.positionBoxBottomSettings = this.settings.get_int("position-bottom-box");
		if (this.positionBoxBottomSettings === 0)
			this.positionBoxBottomStart.add_actor(this.boxMain);
		else if (this.positionBoxBottomSettings === 1)
			this.positionBoxBottomMiddle.add_actor(this.boxMain);
		else if (this.positionBoxBottomSettings === 2) {
			this.positionBoxBottomEnd.add_actor(this.boxMain);
			this.bottomPanelEndIndicator = true;
		}
		this.positionBoxBottomSystem.add_actor(this.boxMainSystem);
		if ((this.settings.get_enum("tray-button") !== 0) && (!this.bottomPanelEndIndicator) && (ShellVersion[1] <= 14))
			this.positionBoxBottomEnd.add_actor(this.boxBottomPanelTrayButton);
		Main.layoutManager.addChrome(this.bottomPanelActor, {
			affectsStruts: true,
			trackFullscreen: true
		});
		this.bottomPanelActor.add_actor(this.positionBoxBottomStart);
		this.bottomPanelActor.add_actor(this.positionBoxBottomMiddle);
		this.bottomPanelActor.add_actor(this.positionBoxBottomEnd);
		this.bottomPanelActor.add_actor(this.positionBoxBottomSystem);
		let primary = Main.layoutManager.primaryMonitor;
		this.height = (this.panelSize + this.bottomPanelVertical);
		this.bottomPanelActor.set_position(primary.x, primary.y + primary.height - this.height);
		this.bottomPanelActor.set_size(primary.width, -1);
		if (ShellVersion[1] <= 14) {
			Main.messageTray._notificationWidget.set_anchor_point(0, this.height);
			this.setAnchorPoint = true;
			this.messageTrayShowingId = Main.messageTray.connect('showing', Lang.bind(this, function() {
				Main.messageTray.set_anchor_point(0, this.height);
				this.setAnchorPoint = true;
			}));
			this.messageTrayHidingId = Main.messageTray.connect('hiding', Lang.bind(this, function() {
				Main.messageTray.set_anchor_point(0, 0);
				this.setAnchorPoint = true;
			}));
		}
		this.panelSize = ((this.settings.get_int('panel-size-bottom')) - 6 + (this.settings.get_int('tb-icon-size-bottom')));
	},

	//Click Events
	onClickShowAppsButton: function(button, pspec) {
		let numButton = pspec.get_button();
		this.leftbutton = LEFTBUTTON;
		this.rightbutton = RIGHTBUTTON;
		if (this.settings.get_enum("showapps-button-toggle") === 1) {
			this.leftbutton = RIGHTBUTTON;
			this.rightbutton = LEFTBUTTON;
		}
		if (numButton === this.leftbutton) //Left Button
		{
			if (!Main.overview.visible)
				Main.overview.show();
			if (!Main.overview.viewSelector._showAppsButton.checked)
				Main.overview.viewSelector._showAppsButton.checked = true;
			else
				Main.overview.hide();
		} else if (numButton === this.rightbutton) //Right Button
		{
			if (!Main.overview.visible)
				Main.overview.show();
			else if (Main.overview.viewSelector._showAppsButton.checked)
				Main.overview.viewSelector._showAppsButton.checked = false;
			else
				Main.overview.hide();
		}
	},

	onClickWorkspaceButton: function(button, pspec) {
		let numButton = pspec.get_button();
		if (numButton === LEFTBUTTON) //Left Button
		{
			if (this.activeWorkspaceIndex === this.totalWorkspace)
				this.activeWorkspaceIndex = -1;
			let newActiveWorkspace = global.workspace_manager.get_workspace_by_index(this.activeWorkspaceIndex + 1);
			newActiveWorkspace.activate(global.get_current_time());
		} else if (numButton === RIGHTBUTTON) //Right Button
		{
			if (this.activeWorkspaceIndex === 0)
				this.activeWorkspaceIndex = this.totalWorkspace + 1;
			let newActiveWorkspace = global.workspace_manager.get_workspace_by_index(this.activeWorkspaceIndex - 1);
			newActiveWorkspace.activate(global.get_current_time());
		}
	},

	onClickDesktopButton: function(button, pspec) {
		let maxWindows = false;
		let userTime = null;
		let activeWorkspace = global.workspace_manager.get_active_workspace();
		let windows = activeWorkspace.list_windows().filter(function(w) {
			return w.get_window_type() !== Meta.WindowType.DESKTOP;
		});
		let numButton = pspec.get_button();
		if (numButton === LEFTBUTTON) //Left Button
		{
			for (let i = 0; i < windows.length; ++i) {
				if ((this.desktopView) && (!Main.overview.visible)) {
					userTime = windows[i].user_time;
					if (userTime > this.lastFocusedWindowUserTime) {
						this.lastFocusedWindowUserTime = userTime;
						this.lastFocusedWindow = windows[i];
					}
					windows[i].unminimize();
					maxWindows = true;
				} else {
					windows[i].minimize();
				}
			}
			if (maxWindows) {
				this.lastFocusedWindow.activate(global.get_current_time());
			}
			this.desktopView = !this.desktopView;
			if (Main.overview.visible)
				Main.overview.hide();
		} else if ((numButton === RIGHTBUTTON) && (this.settings.get_boolean("desktop-button-right-click"))) //Right Button
			Util.spawnCommandLine('gnome-extensions prefs ' + Extension.metadata.uuid);
	},

	onClickTaskButton: function(button, pspec, window) {
	    if (this.taskMenuUp && this.taskMenu.isOpen) {
	        this.taskMenu.close();
	        return;
	    }

		let numButton = pspec.get_button();
		let buttonAction = 0;

	    if (numButton === LEFTBUTTON)
	        buttonAction = this.settings.get_enum("tasks-left-click");
	    else if (numButton === MIDDLEBUTTON)
	        buttonAction = this.settings.get_enum("tasks-middle-click");
	    else if (numButton === RIGHTBUTTON)
	        buttonAction = this.settings.get_enum("tasks-right-click");

		let app = Shell.WindowTracker.get_default().get_window_app(window);
		let appname = app.get_name();
		let index = this.searchTaskInList(window);

	    switch (buttonAction)
	    {
	        case 0: //Action === 'none'
	            return;
	        case 1: //Action === 'minmax'
	            this.clickActionMinMax(window, appname, index);
	            break;
	        case 2: //Action === 'openmenu'
	            this.clickActionOpenMenu(window, appname, button);
	            break;
	        case 3: //Action === 'close'
	            window.delete(global.get_current_time());
	            break;
            case 4: //Action === 'new_instance'
                app.open_new_window(-1);
                break;
	        default: //Same as 'none'
	            return;
	    }
	},

	onClickTrayButton: function(button, pspec) {
		let numButton = pspec.get_button();
		if (numButton === LEFTBUTTON) //Left Button
		{
			Main.messageTray.toggle();
		}
	},

	//Actions executed depending on button click on Task
	clickActionMinMax: function(window, appname, index) {
	    let activeWorkspace = global.workspace_manager.get_active_workspace();
	    let focusWindow = global.display.focus_window;
	    let nextApp = false;

	    this.tasksList.forEach(
	        function(task) {
	            let [windowTask, buttonTask, signalsTask] = task;
	            let windowWorkspace = windowTask.get_workspace();

	            if (windowTask === window) {
	                if (windowWorkspace !== activeWorkspace) {
	                    windowWorkspace.activate(global.get_current_time());
	                    windowTask.activate(global.get_current_time());
	                }
	                else if (!windowTask.has_focus()) {
	                    windowTask.activate(global.get_current_time());
	                }
	                else if ((!Main.overview.visible) && ((this.settings.get_enum("sort-tasks") === 3) || (this.settings.get_enum("sort-tasks") === 4))) {
	                    for (let i = index - 1; i >= 0; i--) {
	                        let sameWorkspace = true;
	                        let [_windowTask, _buttonTask, _signalsTask] = this.tasksList[i];
	                        let _appname = Shell.WindowTracker.get_default().get_window_app(_windowTask).get_name();
	                        let _windowWorkspace = _windowTask.get_workspace();

	                        if ((appname === _appname) && (_windowTask !== focusWindow)) {
	                            if (_windowWorkspace !== activeWorkspace) {
	                                if (this.settings.get_enum("sort-tasks") === 4) continue;
	                                else _windowWorkspace.activate(global.get_current_time());
	                            }
	                            _windowTask.activate(global.get_current_time());
	                            nextApp = true;
	                            break;
	                        }
	                    }

	                    if (!nextApp) {
	                        for (let k = this.tasksList.length - 1; k >= index; k--) {
	                            let [_windowTask2, _buttonTask2, _signalsTask2] = this.tasksList[k];
	                            let _appname2 = Shell.WindowTracker.get_default().get_window_app(_windowTask2).get_name();
	                            let _windowWorkspace2 = _windowTask2.get_workspace();

	                            if ((appname === _appname2) && (_windowTask2 !== focusWindow)) {
	                                if (_windowWorkspace2 !== activeWorkspace) {
	                                    if (this.settings.get_enum("sort-tasks") === 4)
	                                        continue;
	                                    else
	                                        _windowWorkspace2.activate(global.get_current_time());
	                                }
	                                _windowTask2.activate(global.get_current_time());
	                                nextApp = true;
	                                break;
	                            }
	                        }
	                        windowTask.minimize();
	                    }
	                }
	                else if (!Main.overview.visible)
	                    windowTask.minimize();
	            }
	        },
	        this
	    );

	    if (Main.overview.visible)
	        Main.overview.hide();
	},

	clickActionOpenMenu: function(window, appname, button) {
	    this.taskMenu = null;
	    let app = Shell.WindowTracker.get_default().get_window_app(window);
	    let taskMenuManager = new PopupMenu.PopupMenuManager(button);

	    if (app.action_group && app.menu) {
	        this.taskMenu = new imports.ui.remoteMenu.RemoteMenu(button, app.menu, app.action_group);
	    }
	    else {
	        this.taskMenu = new PopupMenu.PopupMenu(button, 0.0, St.Side.TOP);
	        let menuQuit = new PopupMenu.PopupMenuItem("Quit");

	        menuQuit.connect('activate', Lang.bind(this, function() {
	            window.delete(global.get_current_time());
	        }));
	        this.taskMenu.addMenuItem(menuQuit);
	    }

	    if ((this.settings.get_enum("sort-tasks") === 3) || (this.settings.get_enum("sort-tasks") === 4)) {
	        let counter = 1;
	        let windowsList = null;
	        let title = null;

	        this.tasksList.forEach(
	            function(task) {
	                let [windowTask, buttonTask, signalsTask] = task;
	                let _appname = Shell.WindowTracker.get_default().get_window_app(windowTask).get_name();
	                let windowWorkspace = windowTask.get_workspace();

	                if ((appname === _appname) && (windowTask !== window)) {
	                    if ((windowWorkspace !== window.get_workspace()) && (this.settings.get_enum("sort-tasks") === 4))
	                        return;

	                    windowsList = null;
	                    title = windowTask.get_title();

	                    if (title.length > 50)
	                        title = title.substr(0, 47) + "...";

	                    windowsList = new PopupMenu.PopupMenuItem(title);
	                    windowsList.connect('activate', Lang.bind(this, function() {
	                        if (windowWorkspace !== global.workspace_manager.get_active_workspace())
	                            windowWorkspace.activate(global.get_current_time());
	                        windowTask.activate(global.get_current_time());
	                    }));

	                    this.taskMenu.addMenuItem(windowsList, 0);
	                    counter++;
	                }
	            },
	            this
	        );

	        if (counter > 1) {
	            windowsList = null;
	            title = null;
	            title = window.get_title();
	            if (title.length > 50)
	                title = title.substr(0, 47) + "...";
	            windowsList = new PopupMenu.PopupMenuItem(title);
	            let _windowWorkspace = window.get_workspace();
	            windowsList.connect('activate', Lang.bind(this, function() {
	                window.activate(global.get_current_time());
	            }));
	            this.taskMenu.addMenuItem(windowsList, 0);
	        }
	        else {
	            counter--;
	        }

	        if (counter > 1) {
	            let mini = new PopupMenu.PopupMenuItem("Minimize Window");
	            mini.connect('activate', Lang.bind(this, function() {
	                window.minimize();
	            }));
	            this.taskMenu.addMenuItem(mini, counter);
	            let separator = new PopupMenu.PopupSeparatorMenuItem();
	            this.taskMenu.addMenuItem(separator, counter);
	        }
	    }

	    this.taskMenu.hide();
	    taskMenuManager.addMenu(this.taskMenu);
	    Main.uiGroup.add_actor(this.taskMenu);
	    this.taskMenuUp = true;
	    this.hidePreview();
	    this.taskMenu.open();
	},

	//Scroll Events
	onScrollWorkspaceButton: function(button, event) {
		if ((this.settings.get_enum("scroll-workspaces") === 1) || (this.settings.get_enum("scroll-workspaces") === 2)) {
			let scrollDirection = event.get_scroll_direction();
			if (((scrollDirection === Clutter.ScrollDirection.UP) && (this.settings.get_enum("scroll-workspaces") === 1)) ||
				((scrollDirection === Clutter.ScrollDirection.DOWN) && (this.settings.get_enum("scroll-workspaces") === 2))) {
				if (this.activeWorkspaceIndex === this.totalWorkspace)
					this.activeWorkspaceIndex = -1;
				let newActiveWorkspace = global.workspace_manager.get_workspace_by_index(this.activeWorkspaceIndex + 1);
				newActiveWorkspace.activate(global.get_current_time());
			} else if (((scrollDirection === Clutter.ScrollDirection.DOWN) && (this.settings.get_enum("scroll-workspaces") === 1)) ||
				((scrollDirection === Clutter.ScrollDirection.UP) && (this.settings.get_enum("scroll-workspaces") === 2))) {
				if (this.activeWorkspaceIndex === 0)
					this.activeWorkspaceIndex = this.totalWorkspace + 1;
				let newActiveWorkspace = global.workspace_manager.get_workspace_by_index(this.activeWorkspaceIndex - 1);
				newActiveWorkspace.activate(global.get_current_time());
			}
		}
	},

	onScrollTaskButton: function(button, event) {
		if ((this.settings.get_enum("scroll-tasks") === 1) || (this.settings.get_enum("scroll-tasks") === 2)) {
			this.nextTask = false;
			this.previousTask = null;
			let focusWindow = global.display.focus_window;
			let activeWorkspace = global.workspace_manager.get_active_workspace();
			let scrollDirection = event.get_scroll_direction();
			if (((scrollDirection === Clutter.ScrollDirection.UP) && (this.settings.get_enum("scroll-tasks") === 1)) ||
				((scrollDirection === Clutter.ScrollDirection.DOWN) && (this.settings.get_enum("scroll-tasks") === 2))) {
				this.tasksList.forEach(
					function(task) {
						let [windowTask, buttonTask, signalsTask] = task;
						let windowWorkspace = windowTask.get_workspace();
						if (this.nextTask) {
							if (windowWorkspace !== activeWorkspace)
								windowWorkspace.activate(global.get_current_time());
							windowTask.activate(global.get_current_time());
							this.nextTask = false;
						}
						if (windowTask === focusWindow)
							this.nextTask = true;
					},
					this
				);
				if (Main.overview.visible)
					Main.overview.hide();
			} else if (((scrollDirection === Clutter.ScrollDirection.DOWN) && (this.settings.get_enum("scroll-tasks") === 1)) ||
				((scrollDirection === Clutter.ScrollDirection.UP) && (this.settings.get_enum("scroll-tasks") === 2))) {
				this.tasksList.forEach(
					function(task) {
						let [windowTask, buttonTask, signalsTask] = task;
						if ((windowTask === focusWindow) && (this.previousTask !== null)) {
							let [windowTask, buttonTask, signalsTask] = this.previousTask;
							let windowWorkspace = windowTask.get_workspace();
							if (windowWorkspace !== activeWorkspace)
								windowWorkspace.activate(global.get_current_time());
							windowTask.activate(global.get_current_time());
						}
						this.previousTask = task;
					},
					this
				);
				if (Main.overview.visible)
					Main.overview.hide();
			}
		}
	},

	//Open Tray on Tray Button Hover
	onHoverTrayButton: function() {
		if (this.settings.get_boolean("hover-tray-button"))
			Main.messageTray.toggle();
	},

	//Switch Task on Hover
	onHoverSwitchTask: function(button, window) {
		if (!this.resetHover) {
			let focusWindow = global.display.focus_window;
			let appname = Shell.WindowTracker.get_default().get_window_app(focusWindow).get_name();
			let activeWorkspace = global.workspace_manager.get_active_workspace();
			this.tasksList.forEach(
				function(task) {
					let [windowTask, buttonTask, signalsTask] = task;
					let windowWorkspace = windowTask.get_workspace();
					let _app_name = Shell.WindowTracker.get_default().get_window_app(windowTask).get_name();
					if ((windowTask === window) && (((appname !== _app_name) && ((this.settings.get_enum("sort-tasks") === 3) || (this.settings.get_enum("sort-tasks") === 4))) || ((this.settings.get_enum("sort-tasks") !== 3) && (this.settings.get_enum("sort-tasks") !== 4)))) {
						if (windowWorkspace !== activeWorkspace) {
							windowWorkspace.activate(global.get_current_time());
							windowTask.activate(global.get_current_time());
						} else if (!windowTask.has_focus())
							windowTask.activate(global.get_current_time());
					}
				},
				this
			);
			if (Main.overview.visible)
				Main.overview.hide();
		}
		if (this.previewTimer2 !== null) {
			Mainloop.source_remove(this.previewTimer2);
			this.previewTimer2 = null;
		}
	},

	//Window Demands Attention
	onWindowDemandsAttention: function(display, window) {
		if ((this.settings.get_boolean("display-tasks")) && (this.settings.get_boolean("blink-tasks"))) {
			this.tasksList.forEach(
				function(task) {
					let [windowTask, buttonTask, signalsTask] = task;
					if ((windowTask === window) && (!windowTask.has_focus())) {
						this.attentionStyleChanged = false;
						this.attentionStyle = "background-color: " + this.settings.get_string("blink-color") + "; margin-right: " + this.inactiveMargin + "px;";
						this.attentionStyleChangeTimeout = Mainloop.timeout_add(this.settings.get_int("blink-rate"), Lang.bind(this, this.changeAttentionStyle, windowTask, buttonTask));
					}
				},
				this
			);
		}
	},

	changeAttentionStyle: function(windowTask, buttonTask) {
		if ((!this.attentionStyleChanged) && (!windowTask.has_focus())) {
			buttonTask.set_style(this.attentionStyle);
			this.attentionStyleChanged = true;
			return true;
		} else if ((this.attentionStyleChanged) && (!windowTask.has_focus())) {
			buttonTask.set_style(this.inactiveBackgroundStyleColor);
			this.attentionStyleChanged = false;
			return true;
		} else
			return false;
	},

	//Init Windows Manage Callbacks
	initWindows: function(windowsList, type, window) {
		if (this.settings.get_boolean("display-tasks")) {
			//Active Task Frame / Background Color
			this.activeTaskFrame();
			//Inactive Task Frame / Background Color
			this.inactiveTaskFrame();
			//Task Menu
			this.taskMenu = null;
			this.taskMenuUp = false;
			this.tasksContainerSize();
			this.windows = new Windows.Windows(this, this.onWindowsListChanged, this.onWindowChanged);
		}
	},

    //Taskslist
    onWindowsListChanged: function(windowsList, type, window) {
        this.cleanTasksList();
        windowsList.forEach(
            function(window) {
                this.addTaskInList(window);
            },
            this
        );
        this.hidePreview();
        this.tasksContainer();
        this.iconGeometry();
        this.updateIcon();
    },

	//Tasks Container
	tasksContainer: function(window) {
		if ((this.tasksContainerWidth > 0) && (this.countTasks > 0) && (this.countTasks > this.tasksContainerWidth)) {
			let buttonTaskWidth;
			if (this.settings.get_enum("tasks-label") !== 0)
				buttonTaskWidth = this.settings.get_int("tasks-width");
			else
				buttonTaskWidth = (this.panelSize + 8);
			let totalWidth = this.boxMainTasks.get_width();
			let spaces = this.settings.get_int("tasks-spaces");
			let counter = 0;
			this.tasksList.forEach(
				function(task) {
					let [windowTask, buttonTask, signalsTask] = task;
					if (buttonTask.visible)
						counter++;
				},
				this
			);
			let newWidth = ((totalWidth - (spaces * counter)) / counter);
			if (newWidth > buttonTaskWidth) {
				newWidth = buttonTaskWidth;
			}
			this.tasksList.forEach(
				function(_task) {
					let [_windowTask, _buttonTask, _signalsTask] = _task;
					_buttonTask.set_width(newWidth);
				},
				this
			);
		}
	},

	//Tasks Container Size
	tasksContainerSize: function() {
		if (this.tasksContainerWidth > 0) {
			let spaces = this.settings.get_int("tasks-spaces");
			let buttonTaskWidth = 0;
			this.tasksWidth = this.settings.get_int("tasks-width");
			if (this.settings.get_enum("tasks-label") !== 0)
				buttonTaskWidth = this.tasksWidth;
			else
				buttonTaskWidth = (this.panelSize + 8);
			this.newTasksContainerWidth = (this.tasksContainerWidth * (buttonTaskWidth + spaces));
			this.boxMainTasks.set_width(this.newTasksContainerWidth);
		}
	},

    //Icon Geometry
	iconGeometry: function() {
		for (let i = this.tasksList.length - 1; i >= 0; i--) {
			let [windowTask, buttonTask, signalsTask, labelTask, iconTask] = this.tasksList[i];
			let rect = new Meta.Rectangle();
			[rect.x, rect.y] = buttonTask.get_transformed_position();
            [rect.width, rect.height] = buttonTask.get_transformed_size();
			windowTask.set_icon_geometry(rect);
		}
	},

    //Icons
    updateIcon: function() {
		this.tasksList.forEach(
			function(task) {
				let [windowTask, buttonTask, signalsTask, labelTask, iconTask] = task;
                let app = Shell.WindowTracker.get_default().get_window_app(windowTask);
                iconTask.child = app.create_icon_texture(this.panelSize);
			},
			this
		);
    },

    updateTasks: function() {
        this.iconGeometry();
        this.updateIcon();
    },

	//Active Tasks
	activeTasks: function(window) {
		let active = false;
		let activeWorkspace = global.workspace_manager.get_active_workspace();
		this.tasksList.forEach(
			function(task) {
				let [windowTask, buttonTask, signalsTask] = task;
				let workspaceTask = windowTask.get_workspace();
				if ((!windowTask.minimized) && (workspaceTask === activeWorkspace))
					active = true;
			},
			this
		);
		if (active === true)
			this.desktopView = false;
		else
			this.desktopView = true;
	},

	//Task Style
	onWindowChanged: function(window, type) {
		if (type === 0) //Focus
		{
			this.tasksList.forEach(
				function(task) {
					let [windowTask, buttonTask, signalsTask, labelTask] = task;
					if (windowTask === window) {
						buttonTask.set_style(this.backgroundStyleColor);
						buttonTask.show();
						if ((this.settings.get_enum("tasks-label") !== 0) && (this.settings.get_boolean("display-tasks-label-color"))) {
							this.tasksLabelColor = this.settings.get_string("tasks-label-color");
							if (this.tasksLabelColor !== "unset") {
								this.tasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; padding-top: ' + ((this.panelSize - 5 - (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize)) / 2) + 'px; color: ' + this.tasksLabelColor + ';';
								labelTask.set_style(this.tasksLabelStyle);
							} else
								labelTask.set_style("None");
						} else if (this.settings.get_enum("tasks-label") !== 0) {
							this.tasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; padding-top: ' + ((this.panelSize - 5 - (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize)) / 2) + 'px;';
							labelTask.set_style(this.tasksLabelStyle);
						}
					} else {
						buttonTask.set_style(this.inactiveBackgroundStyleColor);
						if ((this.settings.get_enum("sort-tasks") === 3) || (this.settings.get_enum("sort-tasks") === 4)) {
							let _app_name = Shell.WindowTracker.get_default().get_window_app(window).get_name();
							let appname = Shell.WindowTracker.get_default().get_window_app(windowTask).get_name();
							let workspaceTask = windowTask.get_workspace();
							let activeWorkspace = global.workspace_manager.get_active_workspace();
							if ((_app_name === appname) && ((workspaceTask === activeWorkspace) || (this.settings.get_enum("sort-tasks") === 3)))
								buttonTask.hide();
						}
						if ((this.settings.get_enum("tasks-label") !== 0) && (this.settings.get_boolean("display-inactive-tasks-label-color"))) {
							this.inactiveTasksLabelColor = this.settings.get_string("inactive-tasks-label-color");
							if (this.inactiveTasksLabelColor !== "unset") {
								this.inactiveTasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; color: ' + this.inactiveTasksLabelColor + ';';
								labelTask.set_style(this.inactiveTasksLabelStyle);
							} else
								labelTask.set_style("None");
						} else if (this.settings.get_enum("tasks-label") !== 0) {
							this.tasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; padding-top: ' + ((this.panelSize - 5 - (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize)) / 2) + 'px;';
							labelTask.set_style(this.tasksLabelStyle);
						}
					}
				},
				this
			);
		} else if ((type === 1) && (this.settings.get_enum("tasks-label") === 1)) //Title Change
		{
			this.tasksList.forEach(
				function(task) {
					let [windowTask, buttonTask, signalsTask, labelTask] = task;
					if (windowTask === window) {
						labelTask.text = " " + window.get_title() + " ";
					}
				},
				this
			);
		} else if (type === 2) //Minimized
		{
			this.tasksList.forEach(
				function(task) {
					let [windowTask, buttonTask, signalsTask, labelTask] = task;
					if (windowTask === window) {
						buttonTask.set_style(this.inactiveBackgroundStyleColor);
						if ((this.settings.get_enum("tasks-label") !== 0) && (this.settings.get_boolean("display-inactive-tasks-label-color"))) {
							this.inactiveTasksLabelColor = this.settings.get_string("inactive-tasks-label-color");
							if (this.inactiveTasksLabelColor !== "unset") {
								this.inactiveTasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; color: ' + this.inactiveTasksLabelColor + ';';
								labelTask.set_style(this.inactiveTasksLabelStyle);
							} else
								labelTask.set_style("None");
						} else if (this.settings.get_enum("tasks-label") !== 0) {
							this.tasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; padding-top: ' + ((this.panelSize - 5 - (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize)) / 2) + 'px;';
							labelTask.set_style(this.tasksLabelStyle);
						}
					}
				},
				this
			);
		} else if ((type === 3) || (type === 4)) {
              this.updateIcon();
        }
	},

	//Task Index
	searchTaskInList: function(window) {
		let index = null;
		for (let indexTask in this.tasksList) {
			let [windowTask, buttonTask, signalsTask] = this.tasksList[indexTask];
			if (windowTask === window) {
				index = indexTask;
				break;
			}
		}
		return index;
	},

	//Add Tasks
	addTaskInList: function(window) {
		let app = Shell.WindowTracker.get_default().get_window_app(window);
		let buttonTask = null;
        let iconTask = new St.Bin();
		let labelTask = null;
		if (app !== null) {
			let appname = app.get_name();
			//Check Blacklisted Apps
			if (this.settings.get_boolean("blacklist-set")) {
				let blacklist = this.settings.get_strv("blacklist");
				if (blacklist.length > 0) {
					for (let j = 0; j < blacklist.length; j++) {
						let blacklistapp = blacklist[j];
						if (appname === blacklistapp) {
							return;
                        }
					}
				}
			}
			//Tasks Label
			if (this.settings.get_enum("tasks-label") !== 0) {
				let buttonTaskLayout = null;
				if (this.settings.get_boolean("bottom-panel")) {
					buttonTaskLayout = new St.BoxLayout({
						style_class: "tkb-task-button-bottom-label"
					});
                } else {
					buttonTaskLayout = new St.BoxLayout({
						style_class: "tkb-task-button"
					});
                }
				buttonTaskLayout.add_actor(iconTask);
				if (this.settings.get_enum("tasks-label") === 1) {
					labelTask = new St.Label({
						text: (" " + window.get_title() + " ")
					});
                } else {
					labelTask = new St.Label({
						text: (" " + appname + " ")
					});
                }
				labelTask.set_style('font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; padding-top: ' + ((this.panelSize - 5 - (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize)) / 2) + 'px;');
				buttonTaskLayout.add_actor(labelTask);
				buttonTask = new St.Button({
					style_class: "tkb-task-button",
					child: buttonTaskLayout,
					x_align: St.Align.START
				});
				this.tasksWidth = this.settings.get_int("tasks-width");
				buttonTask.set_width(this.tasksWidth);
			} else {
				if (this.settings.get_boolean("bottom-panel")) {
					buttonTask = new St.Button({
						style_class: "tkb-task-button-bottom"
					});
                } else {
					buttonTask = new St.Button({
						style_class: "tkb-task-button"
					});
                }
                buttonTask.add_actor(iconTask);
			}
			//Signals
			let signalsTask = [
				buttonTask.connect("button-press-event", Lang.bind(this, this.onClickTaskButton, window)),
				buttonTask.connect("enter-event", Lang.bind(this, this.showPreview, window)),
				buttonTask.connect("leave-event", Lang.bind(this, this.resetPreview, window)),
				buttonTask.connect("notify::allocation", Lang.bind(this, this.updateTasks))
			];
			//Display Tasks of All Workspaces
			if (!this.settings.get_boolean("tasks-all-workspaces")) {
				let workspace = global.workspace_manager.get_active_workspace();
				if (!this.settings.get_boolean("tasks-all-workspaces")) {
					buttonTask.visible = window.located_on_workspace(workspace);
                }
			}
			if (window.has_focus()) {
				buttonTask.set_style(this.backgroundStyleColor);
				if ((this.settings.get_enum("tasks-label") !== 0) && (this.settings.get_boolean("display-tasks-label-color"))) {
					this.tasksLabelColor = this.settings.get_string("tasks-label-color");
					if (this.tasksLabelColor !== "unset") {
						this.tasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; padding-top: ' + ((this.panelSize - 5 - (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize)) / 2) + 'px; color: ' + this.tasksLabelColor + ';';
						labelTask.set_style(this.tasksLabelStyle);
					} else
						labelTask.set_style("None");
				}
			} else {
				buttonTask.set_style(this.inactiveBackgroundStyleColor);
				if ((this.settings.get_enum("tasks-label") !== 0) && (this.settings.get_boolean("display-inactive-tasks-label-color"))) {
					this.inactiveTasksLabelColor = this.settings.get_string("inactive-tasks-label-color");
					if (this.inactiveTasksLabelColor !== "unset") {
						this.inactiveTasksLabelStyle = 'font-size: ' + (this.panelSize - 5 + this.adjustTBLabelSize - this.adjustTBIconSize) + 'px; color: ' + this.inactiveTasksLabelColor + ';';
						labelTask.set_style(this.inactiveTasksLabelStyle);
					} else {
						labelTask.set_style("None");
                    }
				}
			}
			//Sort Tasks
			let inserted = false;
			if (this.settings.get_enum("sort-tasks") !== 0) {
				for (let i = this.tasksList.length - 1; i >= 0; i--) {
					let [_windowTask, _buttonTask, _signalsTask] = this.tasksList[i];
					let _app_name = Shell.WindowTracker.get_default().get_window_app(_windowTask).get_name();
					if (appname === _app_name) {
						if ((this.settings.get_enum("sort-tasks") === 2) || (this.settings.get_enum("sort-tasks") === 4)) {
							let _workspaceTask = _windowTask.get_workspace();
							let workspaceTask = window.get_workspace();
							if (workspaceTask !== _workspaceTask) {
								break;
							}
						}
						this.boxMainTasks.insert_child_above(buttonTask, _buttonTask);
						if ((this.settings.get_enum("sort-tasks") === 3) || (this.settings.get_enum("sort-tasks") === 4)) {
							buttonTask.hide();
                        }
						this.tasksList.splice(i + 1, 0, [window, buttonTask, signalsTask, labelTask, iconTask]);
						inserted = true;
						break;
					}
				}
			}
			if (!inserted) {
				this.boxMainTasks.add_child(buttonTask);
				this.tasksList.push([window, buttonTask, signalsTask, labelTask, iconTask]);
			}
			this.countTasks++;
		}
	},

	//Remove Tasks
	removeTaskInList: function(window) {
		let index = this.searchTaskInList(window);
		if (index !== null) {
			let [windowTask, buttonTask, signalsTask] = this.tasksList[index];
			signalsTask.forEach(
				function(signal) {
					buttonTask.disconnect(signal);
				},
				this
			);
			buttonTask.destroy();
			this.tasksList.splice(index, 1);
			this.countTasks--;
			if (this.countTasks < 0)
				this.countTasks = 0;
			if (this.countTasks === 0)
				this.cleanTasksList();
			return true;
		} else
			return false;
	},

	//Reset Taskslist
	cleanTasksList: function() {
		for (let i = this.tasksList.length - 1; i >= 0; i--) {
			let [windowTask, buttonTask, signalsTask] = this.tasksList[i];
			try {
				signalsTask.forEach(
					function(signal) {
						buttonTask.disconnect(signal);
					},
					this
				);
			} catch (e) {
				// try...catch... workaround for crashing when disabling bottom panel in settings
			}
			buttonTask.destroy();
			this.tasksList.splice(i, 1);
		}
		this.tasksList = [];
		this.countTasks = 0;
	},

    //Preview
	getThumbnail: function(window, size) {
		let thumbnail = null;
		let mutterWindow = window.get_compositor_private();
		if (mutterWindow) {
			let windowTexture = mutterWindow.get_texture();
			let width, height;
			if (windowTexture.get_size) {
				[width, height] = windowTexture.get_size();
			} else {
				let preferred_size_ok;
	            [preferred_size_ok, width, height] = windowTexture.get_preferred_size();
			}
			let scale = Math.min(1.0, size / width, size / height);
			thumbnail = new Clutter.Clone({
				source: mutterWindow,
				reactive: true,
				width: width * scale,
				height: height * scale
			});
		}
		return thumbnail;
	},

	showPreview: function(button, pspec, window) {
		//Switch Task on Hover
		this.resetHover = false;
		if (this.settings.get_boolean("hover-switch-task")) {
			if (this.settings.get_int("hover-delay") === 0)
				this.onHoverSwitchTask(button, window);
			else
				this.previewTimer2 = Mainloop.timeout_add(this.settings.get_int("hover-delay"),
					Lang.bind(this, this.onHoverSwitchTask, button, window));
		}
		//Hide current preview if necessary
		this.hidePreview();
		this.grouped = false;
		if ((this.settings.get_enum("display-label") !== 0) || (this.settings.get_boolean("display-thumbnail"))) {
			if ((this.settings.get_enum("sort-tasks") === 3) || (this.settings.get_enum("sort-tasks") === 4)) {
				let appname = Shell.WindowTracker.get_default().get_window_app(window).get_name();
				let focuswindow = global.display.focus_window;
				let focusappname = Shell.WindowTracker.get_default().get_window_app(focuswindow).get_name();
				for (let i = this.tasksList.length - 1; i >= 0; i--) {
					let [_windowTask, _buttonTask, _signalsTask] = this.tasksList[i];
					let _app_name = Shell.WindowTracker.get_default().get_window_app(_windowTask).get_name();
					if ((appname === _app_name) && (_windowTask !== window)) {
						this.grouped = true;
						if (appname === focusappname) {
							window = global.display.focus_window;
							break;
						}
					}
				}
			}
			if (this.settings.get_int("preview-delay") === 0)
				this.showPreview2(button, window);
			else
				this.previewTimer = Mainloop.timeout_add(this.settings.get_int("preview-delay"),
					Lang.bind(this, this.showPreview2, button, window));
		}
	},

	showPreview2: function(button, window) {
		//Hide current preview if necessary
		this.hidePreview();
		let app = Shell.WindowTracker.get_default().get_window_app(window);
		this.previewFontSize = this.settings.get_int("preview-font-size");
		this.preview = new St.BoxLayout({
			vertical: true
		});
		if (this.settings.get_enum("display-label") !== 0) {
			if (this.settings.get_enum("display-label") !== 2) {
				let labelNamePreview;
				if (this.grouped) {
					labelNamePreview = new St.Label({
						text: ' ' + app.get_name() + ' (Group) '
					});
				} else {
					labelNamePreview = new St.Label({
						text: ' ' + app.get_name() + ' '
					});
				}
				if ((this.settings.get_string("preview-label-color") !== 'unset') && (this.settings.get_boolean("display-preview-label-color"))) {
					this.previewLabelColor = this.settings.get_string("preview-label-color");
					this.labelNamePreviewStyle = "color: " + this.previewLabelColor + "; font-weight: bold; font-size: " + this.previewFontSize + "pt; text-align: center;";
					labelNamePreview.set_style(this.labelNamePreviewStyle);
				} else {
					this.labelNamePreviewStyle = "color: rgba(255,255,255,1); font-weight: bold; font-size: " + this.previewFontSize + "pt; text-align: center;";
					labelNamePreview.set_style(this.labelNamePreviewStyle);
				}
				this.preview.add_actor(labelNamePreview);
			}
			if (this.settings.get_enum("display-label") !== 1) {
				let title = window.get_title();
				if ((title.length > 50) && (this.settings.get_boolean("display-thumbnail")))
					title = title.substr(0, 47) + "...";
				let labelTitlePreview = new St.Label({
					text: ' ' + title + ' '
				});
				if ((this.settings.get_string("preview-label-color") !== 'unset') && (this.settings.get_boolean("display-preview-label-color"))) {
					this.previewLabelColor = this.settings.get_string("preview-label-color");
					this.labelTitlePreviewStyle = "color: " + this.previewLabelColor + "; font-weight: bold; font-size: " + this.previewFontSize + "pt; text-align: center;";
					labelTitlePreview.set_style(this.labelTitlePreviewStyle);
				} else {
					this.labelTitlePreviewStyle = "color: rgba(255,255,255,1.0); font-weight: bold; font-size: " + this.previewFontSize + "pt; text-align: center;";
					labelTitlePreview.set_style(this.labelTitlePreviewStyle);
				}
				this.preview.add_actor(labelTitlePreview);
			}
		}
		if (this.settings.get_boolean("display-thumbnail")) {
			let thumbnail = this.getThumbnail(window, this.settings.get_int("preview-size"));
			this.preview.add_actor(thumbnail);
		}
		if ((this.settings.get_string("preview-background-color") !== 'unset') && (this.settings.get_boolean("display-preview-background-color"))) {
			this.previewBackgroundColor = this.settings.get_string("preview-background-color");
			this.previewStyle = "background-color: " + this.previewBackgroundColor + "; padding: 5px; border-radius: 8px; -y-offset: 6px;";
			this.preview.set_style(this.previewStyle);
		} else {
			this.previewStyle = "background-color: rgba(0,0,0,0.9); padding: 5px; border-radius: 8px; -y-offset: 6px;";
			this.preview.set_style(this.previewStyle);
		}
		global.stage.add_actor(this.preview);
		this.button = button;
		this.setPreviewPosition();
	},

	showFavoritesPreview: function(buttonfavorite, favoriteapp) {
		//Hide current preview if necessary
		this.hidePreview();
		this.previewFontSize = this.settings.get_int("preview-font-size");
		this.favoritesPreview = new St.BoxLayout({
			vertical: true
		});
		let favoriteappName = favoriteapp.get_name();
		if (favoriteapp.get_description()) {
			if (this.settings.get_enum("display-favorites-label") === 2)
				favoriteappName = favoriteapp.get_description();
			if (this.settings.get_enum("display-favorites-label") === 3)
				favoriteappName += '\n' + favoriteapp.get_description();
		}
		let labelNamePreview = new St.Label({
			text: favoriteappName
		});
		if ((this.settings.get_string("preview-label-color") !== 'unset') && (this.settings.get_boolean("display-preview-label-color"))) {
			this.previewLabelColor = this.settings.get_string("preview-label-color");
			this.labelNamePreviewStyle = "color: " + this.previewLabelColor + "; font-weight: bold; font-size: " + this.previewFontSize + "pt; text-align: center;";
			labelNamePreview.set_style(this.labelNamePreviewStyle);
		} else {
			this.labelNamePreviewStyle = "color: rgba(255,255,255,1.0); font-weight: bold; font-size: " + this.previewFontSize + "pt; text-align: center;";
			labelNamePreview.set_style(this.labelNamePreviewStyle);
		}
		this.favoritesPreview.add_actor(labelNamePreview);
		if ((this.settings.get_string("preview-background-color") !== 'unset') && (this.settings.get_boolean("display-preview-background-color"))) {
			this.previewBackgroundColor = this.settings.get_string("preview-background-color");
			this.favoritesPreviewStyle = "background-color: " + this.previewBackgroundColor + "; padding: 5px; border-radius: 8px; -y-offset: 6px;";
			this.favoritesPreview.set_style(this.favoritesPreviewStyle);
		} else {
			this.favoritesPreviewStyle = "background-color: rgba(0,0,0,0.9); padding: 5px; border-radius: 8px; -y-offset: 6px;";
			this.favoritesPreview.set_style(this.favoritesPreviewStyle);
		}
		global.stage.add_actor(this.favoritesPreview);
		this.button = buttonfavorite;
		this.preview = this.favoritesPreview;
		this.setPreviewPosition();
	},

	setPreviewPosition: function() {
		let [stageX, stageY] = this.button.get_transformed_position();
		let itemHeight = this.button.allocation.y2 - this.button.allocation.y1;
		let itemWidth = this.button.allocation.x2 - this.button.allocation.x1;
		let labelWidth = this.preview.get_width();
		let labelHeight = this.preview.get_height();
		let node = this.preview.get_theme_node();
		let yOffset = node.get_length('-y-offset');
		let y = null;
		if ((this.settings.get_boolean("bottom-panel")) || (this.tbp))
			y = stageY - labelHeight - yOffset;
		else
			y = stageY + itemHeight + yOffset;
		let x = Math.floor(stageX + itemWidth / 2 - labelWidth / 2);
		let posparent = this.preview.get_parent();
		let posparentWidth = posparent.allocation.x2 - posparent.allocation.x1;
		if (Clutter.get_default_text_direction() === Clutter.TextDirection.LTR) {
			x = Math.min(x, posparentWidth - labelWidth - 6);
			x = Math.max(x, 6);
		} else {
			x = Math.max(x, 6);
			x = Math.min(x, posparentWidth - labelWidth - 6);
		}
		this.preview.set_position(x, y);
	},

	resetPreview: function(button, window) {
		//Reset Hover
		this.resetHover = true;
		if (this.previewTimer2 !== null) {
			Mainloop.source_remove(this.previewTimer2);
			this.previewTimer2 = null;
		}
		this.hidePreview();
	},

	hidePreview: function() {
		//Remove preview programmed if necessary
		if (this.previewTimer !== null) {
			Mainloop.source_remove(this.previewTimer);
			this.previewTimer = null;
		}

		//Destroy Preview if displaying
		if (this.preview !== null) {
			this.preview.destroy();
			this.preview = null;
		}

		//Destroy Favorites Preview if displaying
		if (this.favoritesPreview !== null) {
			this.favoritesPreview.destroy();
			this.favoritesPreview = null;
		}
	}
};
