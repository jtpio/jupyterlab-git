import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandRegistry } from '@lumino/commands';
import 'jest';
import plugins from '../index';
import { GitSidebar } from '../sidebar';
import {
  gitBranchesAndTagsSectionPlugin,
  gitChangesSectionPlugin,
  gitHistorySectionPlugin,
  gitSidebarPlugin
} from '../sidebarPlugins';
import { GitSidebarSectionIDs, IGitExtension, IGitSidebar } from '../tokens';

describe('Git sidebar plugins', () => {
  const app = { commands: new CommandRegistry() } as JupyterFrontEnd;
  const fileBrowser = { model: {} } as IDefaultFileBrowser;
  const settingRegistry = {
    load: jest.fn().mockResolvedValue({})
  } as unknown as ISettingRegistry;

  it('exports each built-in section as an independent plugin', () => {
    const pluginIds = plugins.map(plugin => plugin.id);

    expect(pluginIds).toEqual(
      expect.arrayContaining([
        gitSidebarPlugin.id,
        GitSidebarSectionIDs.changes,
        GitSidebarSectionIDs.history,
        GitSidebarSectionIDs.branchesAndTags
      ])
    );
    expect(gitSidebarPlugin.provides).toBe(IGitSidebar);
  });

  it('registers the built-in sections with their expected ordering', async () => {
    const sidebar = new GitSidebar();
    const model = {} as IGitExtension;

    await gitChangesSectionPlugin.activate(
      app,
      sidebar,
      model,
      fileBrowser,
      settingRegistry,
      null
    );
    await gitHistorySectionPlugin.activate(
      app,
      sidebar,
      model,
      fileBrowser,
      settingRegistry,
      null
    );
    await gitBranchesAndTagsSectionPlugin.activate(
      app,
      sidebar,
      model,
      fileBrowser,
      settingRegistry,
      null
    );

    expect(sidebar.sections.map(section => section.id)).toEqual([
      GitSidebarSectionIDs.changes,
      GitSidebarSectionIDs.history,
      GitSidebarSectionIDs.branchesAndTags
    ]);
    expect(sidebar.sections.map(section => section.widget.title.label)).toEqual(
      ['Changes', 'History', 'Branches and Tags']
    );
    sidebar.dispose();
  });
});
