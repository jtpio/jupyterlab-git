import type { ISectionEntry } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { nullTranslator } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import { Signal } from '@lumino/signaling';
import { AccordionPanel, Widget } from '@lumino/widgets';
import 'jest';
import { GitSidebar } from '../sidebar';
import { IGitExtension, IGitSidebar } from '../tokens';
import { GitWidget } from '../widgets/GitWidget';

describe('GitWidget sections', () => {
  let model: IGitExtension;
  let settings: ISettingRegistry.ISettings;
  let sidebar: GitSidebar;
  let widget: GitWidget;

  beforeEach(() => {
    model = {
      refresh: jest.fn().mockResolvedValue(undefined),
      refreshStandbyCondition: () => false
    } as unknown as IGitExtension;
    settings = {
      composite: { refreshIfHidden: false }
    } as unknown as ISettingRegistry.ISettings;
    sidebar = new GitSidebar();
  });

  afterEach(() => {
    widget?.dispose();
    sidebar.dispose();
  });

  function createGitWidget(): GitWidget {
    return new GitWidget(
      model,
      settings,
      new CommandRegistry(),
      nullTranslator.load('jupyterlab_git'),
      sidebar
    );
  }

  function createSection(id: string, rank: number): IGitSidebar.ISection {
    const widget = new Widget();
    widget.title.label = id;
    return {
      id,
      rank,
      widget
    };
  }

  it('renders registered sections in rank order', () => {
    sidebar.registerSection(createSection('history', 20));
    sidebar.registerSection(createSection('changes', 10));

    widget = createGitWidget();

    expect(widget.widgets.map(section => section.title.label)).toEqual([
      'changes',
      'history'
    ]);
    expect(widget.widgets[0].node.dataset.gitSidebarSection).toBe('changes');
  });

  it('adds and removes sections after the widget is created', () => {
    widget = createGitWidget();
    const section = new Widget();
    section.title.label = 'Section';

    const registration = sidebar.registerSection({
      id: 'section',
      widget: section
    });
    expect(widget.widgets).toEqual([section]);

    registration.dispose();
    expect(widget.widgets).toHaveLength(0);
    expect(section.isDisposed).toBe(true);
  });

  it('responds to section visibility changes', () => {
    const visibilityChanged = new Signal<object, void>({});
    const section = new Widget();
    section.title.label = 'Conditional';
    let isVisible = false;

    sidebar.registerSection({
      id: 'conditional',
      widget: section,
      isVisible: () => isVisible,
      visibilityChanged
    });
    widget = createGitWidget();
    expect(widget.widgets).toHaveLength(0);

    isVisible = true;
    visibilityChanged.emit(undefined);
    expect(widget.widgets).toEqual([section]);

    isVisible = false;
    visibilityChanged.emit(undefined);
    expect(widget.widgets).toHaveLength(0);

    isVisible = true;
    visibilityChanged.emit(undefined);
    expect(widget.widgets).toEqual([section]);
  });

  describe('movable sections', () => {
    it('exposes the accordion panel rendering the sections', () => {
      widget = createGitWidget();

      expect(widget.accordionPanel).toBeInstanceOf(AccordionPanel);
      expect(widget.accordionPanel.widgets).toEqual(widget.widgets);
    });

    it('lists displayed sections with their accordion title nodes', () => {
      sidebar.registerSection(createSection('changes', 10));
      sidebar.registerSection(createSection('history', 20));

      widget = createGitWidget();
      const entries = widget.getSections();

      expect(entries.map(entry => entry.id).sort()).toEqual([
        'changes',
        'history'
      ]);
      entries.forEach(entry => {
        const index = widget.accordionPanel.widgets.indexOf(entry.widget);
        expect(widget.accordionPanel.titles[index]).toBe(entry.titleNode);
      });
    });

    it('emits sectionAdded each time a section is attached', () => {
      widget = createGitWidget();
      const added: ISectionEntry[] = [];
      widget.sectionAdded.connect((_, entry) => {
        added.push(entry);
      });

      const visibilityChanged = new Signal<object, void>({});
      let isVisible = true;
      const section = createSection('conditional', 10);
      sidebar.registerSection({
        ...section,
        isVisible: () => isVisible,
        visibilityChanged
      });

      expect(added.map(entry => entry.id)).toEqual(['conditional']);
      expect(added[0].widget).toBe(section.widget);
      expect(added[0].titleNode).toBe(widget.accordionPanel.titles[0]);

      // Hiding and showing again recreates the accordion title, so the
      // signal must fire for the new attachment as well.
      isVisible = false;
      visibilityChanged.emit(undefined);
      isVisible = true;
      visibilityChanged.emit(undefined);
      expect(added.map(entry => entry.id)).toEqual([
        'conditional',
        'conditional'
      ]);
    });

    it('detaches a section and keeps it out of later synchronizations', () => {
      const changes = createSection('changes', 10);
      sidebar.registerSection(changes);
      sidebar.registerSection(createSection('branches', 30));
      widget = createGitWidget();

      const removed = widget.removeSectionById('changes');

      expect(removed).toBe(changes.widget);
      expect(removed!.parent).toBeNull();

      // A registry change re-syncs the sections; the moved-out one must not
      // be re-attached.
      sidebar.registerSection(createSection('history', 20));
      expect(removed!.parent).toBeNull();
      expect(widget.widgets.map(section => section.title.label)).toEqual([
        'history',
        'branches'
      ]);
    });

    it('returns null when removing an unknown or hidden section', () => {
      sidebar.registerSection({
        ...createSection('hidden', 10),
        isVisible: () => false
      });
      widget = createGitWidget();

      expect(widget.removeSectionById('unknown')).toBeNull();
      expect(widget.removeSectionById('hidden')).toBeNull();
    });

    it('re-attaches a section in rank order on reinsertSection', () => {
      sidebar.registerSection(createSection('changes', 10));
      const history = createSection('history', 20);
      sidebar.registerSection(history);
      sidebar.registerSection(createSection('branches', 30));
      widget = createGitWidget();

      const removed = widget.removeSectionById('history')!;
      expect(widget.widgets.map(section => section.title.label)).toEqual([
        'changes',
        'branches'
      ]);

      widget.reinsertSection(removed);
      expect(widget.widgets.map(section => section.title.label)).toEqual([
        'changes',
        'history',
        'branches'
      ]);
      expect(
        widget
          .getSections()
          .map(entry => entry.id)
          .sort()
      ).toEqual(['branches', 'changes', 'history']);
    });

    it('hosts and releases sections moved in from other panels', () => {
      sidebar.registerSection(createSection('changes', 10));
      widget = createGitWidget();

      const foreign = new Widget();
      foreign.title.label = 'Foreign';
      widget.addSection(foreign);

      expect(widget.sections).toEqual([foreign]);
      expect(widget.widgets).toContain(foreign);

      widget.removeSectionWidget(foreign);
      expect(widget.sections).toHaveLength(0);
      expect(foreign.parent).toBeNull();
    });

    it('drops disposed hosted sections', () => {
      widget = createGitWidget();

      const foreign = new Widget();
      widget.addSection(foreign);
      expect(widget.sections).toEqual([foreign]);

      foreign.dispose();
      expect(widget.sections).toHaveLength(0);
    });
  });
});
