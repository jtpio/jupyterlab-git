import { ReactWidget } from '@jupyterlab/apputils';
import type {
  IMovableSectionDestination,
  IMovableSectionSource,
  ISectionEntry
} from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { TranslationBundle } from '@jupyterlab/translation';
import { SidePanel } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import { Message } from '@lumino/messaging';
import { ISignal, Signal } from '@lumino/signaling';
import { AccordionPanel, PanelLayout, Widget } from '@lumino/widgets';
import * as React from 'react';
import { Toolbar } from '../components/Toolbar';
import { gitWidgetStyle, sectionStyle } from '../style/GitWidgetStyle';
import { IGitExtension, IGitSidebar } from '../tokens';

/**
 * The Git extension's main side-bar widget.
 *
 * Implements `IMovableSectionSource` and `IMovableSectionDestination` so that,
 * on JupyterLab >= 4.6, the move-sections plugin can move Git sections to
 * other panels and host sections coming from other panels.
 */
export class GitWidget
  extends SidePanel
  implements IMovableSectionSource, IMovableSectionDestination
{
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

  /**
   * The accordion panel rendering the sidebar sections.
   */
  get accordionPanel(): AccordionPanel {
    return this.content as AccordionPanel;
  }

  /**
   * A signal emitted when a section widget is added to the accordion.
   */
  get sectionAdded(): ISignal<this, ISectionEntry> {
    return this._sectionAdded;
  }

  /**
   * The section widgets hosted on behalf of other panels.
   */
  get sections(): ReadonlyArray<Widget> {
    return [...this._hostedSections];
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
    this._movedOutSections.clear();
    this._hostedSections.length = 0;
    super.dispose();
  }

  /**
   * Return the Git sections currently displayed in the accordion, with the
   * title nodes the move-sections plugin attaches its context menu to.
   */
  getSections(): ReadonlyArray<ISectionEntry> {
    const accordion = this.accordionPanel;
    const entries: ISectionEntry[] = [];
    this._renderedSections.forEach((section, id) => {
      const index = accordion.widgets.indexOf(section.widget);
      if (index >= 0 && accordion.titles[index]) {
        entries.push({
          id,
          titleNode: accordion.titles[index],
          widget: section.widget
        });
      }
    });
    return entries;
  }

  /**
   * Detach the Git section with the given identifier so the move-sections
   * plugin can hand it to another panel.
   *
   * The section is excluded from section synchronization until it is given
   * back through `reinsertSection`.
   *
   * @param sectionId - The identifier of the section to remove.
   * @returns The section widget, or `null` if it is not currently displayed.
   */
  removeSectionById(sectionId: string): Widget | null {
    const section = this._renderedSections.get(sectionId);
    if (!section || section.widget.parent !== this.content) {
      return null;
    }
    this._movedOutSections.add(sectionId);
    section.widget.parent = null;
    return section.widget;
  }

  /**
   * Re-attach a section widget previously detached by `removeSectionById`.
   *
   * @param widget - The widget to re-insert.
   */
  reinsertSection(widget: Widget): void {
    for (const [id, section] of this._renderedSections) {
      if (section.widget === widget) {
        this._movedOutSections.delete(id);
        break;
      }
    }
    this._syncSections();
  }

  /**
   * Host a section widget moved in from another panel.
   *
   * @param widget - The widget detached from its source panel.
   */
  addSection(widget: Widget): void {
    if (!this._hostedSections.includes(widget)) {
      this._hostedSections.push(widget);
      widget.disposed.connect(this._onHostedSectionDisposed, this);
    }
    this.addWidget(widget);
  }

  /**
   * Remove a hosted section widget so it can return to its source panel.
   *
   * @param widget - The widget to detach.
   */
  removeSectionWidget(widget: Widget): void {
    const index = this._hostedSections.indexOf(widget);
    if (index >= 0) {
      this._hostedSections.splice(index, 1);
      widget.disposed.disconnect(this._onHostedSectionDisposed, this);
    }
    if (widget.parent === this.content) {
      widget.parent = null;
    }
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
        this._movedOutSections.delete(id);
      }
    });

    let visibleIndex = 0;
    definitions.forEach(definition => {
      if (!this._renderedSections.has(definition.id)) {
        definition.visibilityChanged?.connect(this._syncSections, this);
        this._renderedSections.set(definition.id, definition);
      }

      if (this._movedOutSections.has(definition.id)) {
        // The section lives in another panel; the move-sections plugin owns
        // it until it is moved back through `reinsertSection`.
        return;
      }

      if (definition.isVisible?.() ?? true) {
        const wasAttached = definition.widget.parent === this.content;
        definition.widget.addClass(sectionStyle);
        definition.widget.node.dataset.gitSidebarSection = definition.id;
        this.insertWidget(visibleIndex++, definition.widget);
        if (!wasAttached) {
          this._emitSectionAdded(definition);
        }
      } else if (definition.widget.parent !== null) {
        definition.widget.parent = null;
      }
    });
  }

  /**
   * Emit `sectionAdded` for a section newly attached to the accordion.
   *
   * The accordion creates a fresh title node each time a widget is attached,
   * so the move-sections plugin needs the signal on every re-attachment.
   */
  private _emitSectionAdded(definition: IGitSidebar.ISection): void {
    const accordion = this.accordionPanel;
    const index = accordion.widgets.indexOf(definition.widget);
    if (index >= 0 && accordion.titles[index]) {
      this._sectionAdded.emit({
        id: definition.id,
        titleNode: accordion.titles[index],
        widget: definition.widget
      });
    }
  }

  private _onHostedSectionDisposed(widget: Widget): void {
    const index = this._hostedSections.indexOf(widget);
    if (index >= 0) {
      this._hostedSections.splice(index, 1);
    }
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
  private _movedOutSections = new Set<string>();
  private _hostedSections: Widget[] = [];
  private _sectionAdded = new Signal<this, ISectionEntry>(this);
}
