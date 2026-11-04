import { JupyterFrontEnd } from '@jupyterlab/application';
import { showDialog } from '@jupyterlab/apputils';
import { FileBrowserModel } from '@jupyterlab/filebrowser';
import { nullTranslator } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import 'jest';
import { CancelledError } from '../cancelledError';
import {
  CommandArguments,
  Operation,
  addCommands,
  showGitOperationDialog
} from '../commandsAndMenu';
import * as git from '../git';
import { GitExtension } from '../model';
import { ContextCommandIDs, CommandIDs, Git } from '../tokens';
import {
  defaultMockedResponses,
  DEFAULT_REPOSITORY_PATH,
  IMockedResponse,
  mockedRequestAPI
} from './utils';
import { CodeMirrorEditorFactory } from '@jupyterlab/codemirror';

jest.mock('../git');
jest.mock('@jupyterlab/apputils');
jest.mock('@jupyterlab/filebrowser');

describe('git-commands', () => {
  const mockGit = git as jest.Mocked<typeof git>;
  let commands: CommandRegistry;
  let model: GitExtension;
  let mockResponses: {
    [endpoint: string]: IMockedResponse;
  };

  const mockedFileBrowserModel = {
    manager: {
      closeAll: jest
        .fn<Promise<void>, any[]>()
        .mockImplementation(() => Promise.resolve())
    }
  } as any as FileBrowserModel;

  beforeEach(async () => {
    jest.restoreAllMocks();

    mockResponses = {
      ...defaultMockedResponses
    };

    mockGit.requestAPI.mockImplementation(
      mockedRequestAPI({ responses: mockResponses }) as any
    );

    commands = new CommandRegistry();
    const app = {
      commands,
      shell: null as any,
      serviceManager: {
        serverSettings: {}
      }
    };

    model = new GitExtension(app as any);
    addCommands(
      app as JupyterFrontEnd,
      model,
      new CodeMirrorEditorFactory(),
      mockedFileBrowserModel,
      null as any,
      nullTranslator
    );
  });

  describe('git:context-discard', () => {
    ['staged', 'partially-staged', 'unstaged', 'untracked'].forEach(status => {
      [' ', 'M', 'A'].forEach(x => {
        it(`status:${status} - x:${x} may reset and/or checkout`, async () => {
          const mockDialog = showDialog as jest.MockedFunction<
            typeof showDialog
          >;
          mockDialog.mockResolvedValue({
            button: {
              accept: true,
              actions: [],
              ariaLabel: '',
              caption: '',
              className: '',
              displayType: 'default',
              iconClass: '',
              iconLabel: '',
              label: ''
            },
            isChecked: null,
            value: undefined
          });
          const spyReset = jest.spyOn(model, 'reset');
          spyReset.mockResolvedValueOnce(undefined);
          const spyCheckout = jest.spyOn(model, 'checkout');
          spyCheckout.mockResolvedValueOnce({} as any);

          const path = 'file/path.ext';
          model.pathRepository = DEFAULT_REPOSITORY_PATH;
          await model.ready;

          await commands.execute(ContextCommandIDs.gitFileDiscard, {
            files: [
              {
                x,
                y: ' ',
                from: 'from',
                to: path,
                status: status as Git.Status,
                is_binary: false
              }
            ]
          } as CommandArguments.IGitContextAction as any);

          if (status === 'staged') {
            expect(spyReset).toHaveBeenCalledWith(path);
          } else if (status === 'unstaged') {
            expect(spyReset).not.toHaveBeenCalled();
            expect(spyCheckout).toHaveBeenCalledWith({ filename: path });
          } else if (status === 'partially-staged') {
            expect(spyReset).toHaveBeenCalledWith(path);
            if (x !== 'A') {
              expect(spyCheckout).toHaveBeenCalledWith({ filename: path });
            } else {
              expect(spyCheckout).not.toHaveBeenCalled();
            }
          }

          spyReset.mockRestore();
          spyCheckout.mockRestore();
        });
      });
    });
  });

  describe('git:context-diff', () => {
    [
      {
        status: 'unstaged',
        reference: { special: 'INDEX' },
        challenger: { special: 'WORKING' }
      },
      {
        status: 'partially-staged',
        reference: { git: 'HEAD' },
        challenger: { special: 'WORKING' }
      },
      {
        status: 'staged',
        reference: { git: 'HEAD' },
        challenger: { special: 'INDEX' }
      }
    ].forEach(({ status, reference, challenger }) => {
      it(`status:${status} - diffs ${JSON.stringify(
        reference
      )} with ${JSON.stringify(challenger)}`, async () => {
        const requests: any[] = [];
        mockGit.requestAPI.mockImplementation(
          mockedRequestAPI({
            responses: {
              ...mockResponses,
              content: {
                body: body => {
                  requests.push(body);
                  return { code: 0, content: '' };
                }
              }
            }
          }) as any
        );

        let diffModel: Git.Diff.IModel | undefined;
        const execute = commands.execute.bind(commands);
        jest.spyOn(commands, 'execute').mockImplementation((id, args) => {
          if (id === CommandIDs.gitShowDiff) {
            diffModel = (args as any).model;
            return Promise.resolve(null);
          }
          return execute(id, args);
        });

        model.pathRepository = DEFAULT_REPOSITORY_PATH;
        await model.ready;

        await commands.execute(ContextCommandIDs.gitFileDiff, {
          files: [
            {
              filePath: 'file.txt',
              isText: true,
              status: status as Git.Status
            }
          ]
        } as CommandArguments.IGitFileDiff as any);
        await diffModel!.reference.content();
        await diffModel!.challenger.content();

        expect(requests).toEqual([
          { filename: 'file.txt', reference },
          { filename: 'file.txt', reference: challenger }
        ]);
      });
    });
  });

  describe('git:reset-to-remote', () => {
    [true, false].forEach(checked => {
      it(
        checked
          ? 'should close all opened files when the checkbox is checked'
          : 'should not close all opened files when the checkbox is not checked',
        async () => {
          const mockDialog = showDialog as jest.MockedFunction<
            typeof showDialog
          >;
          mockDialog.mockResolvedValue({
            button: {
              accept: true,
              actions: [],
              ariaLabel: '',
              caption: '',
              className: '',
              displayType: 'default',
              iconClass: '',
              iconLabel: '',
              label: ''
            },
            isChecked: null,
            value: {
              checked
            } as Git.ICheckboxFormValue
          });

          const spyCloseAll = jest.spyOn(
            mockedFileBrowserModel.manager,
            'closeAll'
          );
          spyCloseAll.mockResolvedValueOnce(undefined);

          mockGit.requestAPI.mockImplementation(
            mockedRequestAPI({
              responses: {
                ...mockResponses,
                reset_to_commit: {
                  body: () => {
                    return { code: 0 };
                  }
                }
              }
            }) as any
          );

          const path = DEFAULT_REPOSITORY_PATH;
          model.pathRepository = path;
          await model.ready;

          await commands.execute(CommandIDs.gitResetToRemote);

          if (checked) {
            expect(spyCloseAll).toHaveBeenCalled();
          } else {
            expect(spyCloseAll).not.toHaveBeenCalled();
          }

          spyCloseAll.mockRestore();
        }
      );
    });
  });

  describe('showGitOperationDialog', () => {
    const key = '/home/me/.ssh/id_ed25519';
    const lockedKeyError = () =>
      new Git.GitResponseError(
        new Response(null, { status: 500 }),
        `SSH key '${key}' is locked: a passphrase is required.`
      );
    const dialogResult = (accept: boolean, value: string) =>
      ({
        button: { accept } as any,
        isChecked: null,
        value
      }) as any;

    beforeEach(() => {
      (showDialog as jest.MockedFunction<typeof showDialog>).mockReset();
      // The automock of '../git' does not keep the regular expression.
      Object.defineProperty(mockGit, 'SSH_KEY_LOCKED_REGEX', {
        value: jest.requireActual('../git').SSH_KEY_LOCKED_REGEX
      });
    });

    it('should unlock a locked SSH key and retry the operation', async () => {
      const mockDialog = showDialog as jest.MockedFunction<typeof showDialog>;
      mockDialog.mockResolvedValueOnce(dialogResult(true, 'open sesame'));
      const fetch = jest
        .spyOn(model, 'fetch')
        .mockRejectedValueOnce(lockedKeyError())
        .mockResolvedValueOnce({ code: 0, message: 'fetched' });
      const addKey = jest
        .spyOn(model, 'addSSHKeyToAgent')
        .mockResolvedValueOnce();
      model.credentialsRequired = true;

      const message = await showGitOperationDialog(
        model,
        Operation.Fetch,
        nullTranslator.load('jupyterlab_git')
      );

      expect(message).toEqual('fetched');
      expect(addKey).toHaveBeenCalledWith(key, 'open sesame');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(model.credentialsRequired).toBe(false);
    });

    it('should ask again when the passphrase is incorrect', async () => {
      const mockDialog = showDialog as jest.MockedFunction<typeof showDialog>;
      mockDialog
        .mockResolvedValueOnce(dialogResult(true, 'wrong'))
        .mockResolvedValueOnce(dialogResult(true, 'open sesame'));
      jest
        .spyOn(model, 'pull')
        .mockRejectedValueOnce(lockedKeyError())
        .mockResolvedValueOnce({ code: 0, message: '' });
      const addKey = jest
        .spyOn(model, 'addSSHKeyToAgent')
        .mockRejectedValueOnce(
          new Git.GitResponseError(
            new Response(null, { status: 400 }),
            'Incorrect passphrase for the SSH key.',
            '',
            { bad_passphrase: true }
          )
        )
        .mockResolvedValueOnce();

      await showGitOperationDialog(
        model,
        Operation.Pull,
        nullTranslator.load('jupyterlab_git')
      );

      expect(mockDialog).toHaveBeenCalledTimes(2);
      expect(addKey).toHaveBeenLastCalledWith(key, 'open sesame');
    });

    it('should ask again when the passphrase is empty', async () => {
      const mockDialog = showDialog as jest.MockedFunction<typeof showDialog>;
      mockDialog
        .mockResolvedValueOnce(dialogResult(true, ''))
        .mockResolvedValueOnce(dialogResult(true, 'open sesame'));
      jest
        .spyOn(model, 'fetch')
        .mockRejectedValueOnce(lockedKeyError())
        .mockResolvedValueOnce({ code: 0, message: '' });
      const addKey = jest
        .spyOn(model, 'addSSHKeyToAgent')
        .mockResolvedValueOnce();

      await showGitOperationDialog(
        model,
        Operation.Fetch,
        nullTranslator.load('jupyterlab_git')
      );

      expect(mockDialog).toHaveBeenCalledTimes(2);
      expect(addKey).toHaveBeenCalledTimes(1);
      expect(addKey).toHaveBeenCalledWith(key, 'open sesame');
    });

    it('should stop when the key is still locked after the unlock', async () => {
      const mockDialog = showDialog as jest.MockedFunction<typeof showDialog>;
      mockDialog.mockResolvedValueOnce(dialogResult(true, 'open sesame'));
      const fetch = jest
        .spyOn(model, 'fetch')
        .mockRejectedValueOnce(lockedKeyError())
        .mockRejectedValueOnce(lockedKeyError());
      jest.spyOn(model, 'addSSHKeyToAgent').mockResolvedValueOnce();

      await expect(
        showGitOperationDialog(
          model,
          Operation.Fetch,
          nullTranslator.load('jupyterlab_git')
        )
      ).rejects.toThrow('ssh still asks for its passphrase');
      expect(mockDialog).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry when the unlock fails for another reason', async () => {
      const mockDialog = showDialog as jest.MockedFunction<typeof showDialog>;
      mockDialog.mockResolvedValueOnce(dialogResult(true, 'open sesame'));
      const fetch = jest
        .spyOn(model, 'fetch')
        .mockRejectedValueOnce(lockedKeyError());
      jest
        .spyOn(model, 'addSSHKeyToAgent')
        .mockRejectedValueOnce(
          new Git.GitResponseError(
            new Response(null, { status: 500 }),
            'Could not open a connection to your authentication agent.',
            '',
            { bad_passphrase: false }
          )
        );

      await expect(
        showGitOperationDialog(
          model,
          Operation.Fetch,
          nullTranslator.load('jupyterlab_git')
        )
      ).rejects.toThrow('authentication agent');
      expect(mockDialog).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry when the unlock dialog is cancelled', async () => {
      const mockDialog = showDialog as jest.MockedFunction<typeof showDialog>;
      mockDialog.mockResolvedValueOnce(dialogResult(false, ''));
      const push = jest
        .spyOn(model, 'push')
        .mockRejectedValueOnce(lockedKeyError());
      const addKey = jest.spyOn(model, 'addSSHKeyToAgent');

      await expect(
        showGitOperationDialog(
          model,
          Operation.Push,
          nullTranslator.load('jupyterlab_git'),
          { remote: 'origin' }
        )
      ).rejects.toThrow(CancelledError);
      expect(push).toHaveBeenCalledTimes(1);
      expect(addKey).not.toHaveBeenCalled();
    });
  });
});
