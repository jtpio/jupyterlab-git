import { ReactWidget } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { TranslationBundle } from '@jupyterlab/translation';
import { SidePanel } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import { Message } from '@lumino/messaging';
import { PanelLayout, Widget } from '@lumino/widgets';
import * as React from 'react';
import { Toolbar } from '../components/Toolbar';
import { gitWidgetStyle, sectionStyle } from '../style/GitWidgetStyle';
import { IGitExtension, IGitSidebar } from '../tokens';

/**
 * The Git extension's main side-bar widget.
 */
export class GitWidget extends SidePanel {
  constructor(
    model: IGitExtension,
    settings: ISettingRegistry.ISettings,
    commands: CommandRegistry,
    trans: TranslationBundle,
    sidebar: IGitSidebar,
    options?: Widget.IOptions
  ) {
    super({
      ...(options as any)
    } as SidePanel.IOptions);
    this.node.id = 'GitSession-root';
    this.addClass(gitWidgetStyle);

    this._gitTrans = trans;
    this._commands = commands;
    this._model = model;
    this._settings = settings;
    this._sidebar = sidebar;

    const topToolbar = ReactWidget.create(this._renderTopToolbar());
    topToolbar.addClass('jp-git-TopToolbar');
    (this.layout as PanelLayout).insertWidget(0, topToolbar);

    sidebar.changed.connect(this._syncSections, this);
    this._syncSections();

    // Add refresh standby condition if this widget is hidden
    model.refreshStandbyCondition = (): boolean =>
      !this._settings.composite['refreshIfHidden'] && this.isHidden;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._sidebar.changed.disconnect(this._syncSections, this);
    this._renderedSections.forEach(section => {
      section.visibilityChanged?.disconnect(this._syncSections, this);
      section.widget.dispose();
    });
    this._renderedSections.clear();
    super.dispose();
  }

  /**
   * A message handler invoked on a `'before-show'` message.
   */
  onBeforeShow(msg: Message): void {
    // Trigger refresh when the widget is displayed
    this._model.refresh().catch(error => {
      console.error('Fail to refresh model when displaying GitWidget.', error);
    });
    super.onBeforeShow(msg);
  }

  /**
   * Synchronize the accordion widgets with the registered section providers.
   */
  private _syncSections(): void {
    const definitions = this._sidebar.sections;
    const registeredIds = new Set(definitions.map(section => section.id));

    this._renderedSections.forEach((section, id) => {
      if (!registeredIds.has(id)) {
        section.visibilityChanged?.disconnect(this._syncSections, this);
        this._renderedSections.delete(id);
      }
    });

    let visibleIndex = 0;
    definitions.forEach(definition => {
      if (!this._renderedSections.has(definition.id)) {
        definition.visibilityChanged?.connect(this._syncSections, this);
        this._renderedSections.set(definition.id, definition);
      }

      if (definition.isVisible?.() ?? true) {
        definition.widget.addClass(sectionStyle);
        definition.widget.node.dataset.gitSidebarSection = definition.id;
        this.insertWidget(visibleIndex++, definition.widget);
      } else if (definition.widget.parent !== null) {
        definition.widget.parent = null;
      }
    });
  }

  private _renderTopToolbar(): React.ReactElement {
    return (
      <Toolbar
        commands={this._commands}
        model={this._model}
        trans={this._gitTrans}
      />
    );
  }

  private _gitTrans: TranslationBundle;
  private _commands: CommandRegistry;
  private _model: IGitExtension;
  private _settings: ISettingRegistry.ISettings;
  private _sidebar: IGitSidebar;
  private _renderedSections = new Map<string, IGitSidebar.ISection>();
}
