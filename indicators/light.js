/* Panel indicators GNOME Shell extension
 *
 * Copyright (C) 2019 Leandro Vital <leavitals@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const { St, UPowerGlib, Clutter } = imports.gi;
const Lang = imports.lang;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Gettext = imports.gettext.domain("bigSur-StatusArea");
const _ = Gettext.gettext;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const CustomButtonXYZ = Extension.imports.indicators.button.CustomButtonXYZ;

var LightIndicator = new Lang.Class({
    Name: "LightIndicator",
    Extends: CustomButtonXYZ,

    _init: function () {
        this.parent("LightIndicator");
        this.menu.actor.add_style_class_name("aggregate-menu");
    
        this._brightness = Main.panel.statusArea.aggregateMenu._brightness;
        this._brightnessIcon = new St.Icon({
            icon_name: "display-brightness-symbolic",
            style_class: "system-status-icon"
        });
        this.box.add_child(this._brightnessIcon);
        Main.panel.statusArea.aggregateMenu.menu.box.remove_actor(this._brightness.menu.actor);
        this.menu.box.add_actor(this._brightness.menu.actor);

        this._separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._separator);
    },
    destroy: function () {
        this.box.remove_child(this._brightnessIcon);
        this.menu.box.remove_actor(this._brightness.menu.actor);
        Main.panel.statusArea.aggregateMenu.menu.box.add_actor(this._brightness.menu.actor);
        
        this.parent();
    }
});