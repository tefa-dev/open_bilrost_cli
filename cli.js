#!/usr/bin/env node

/**
* Copyright (C) 2015-2018 Starbreeze AB All Rights Reserved.
*/

'use strict';

const Path = require('path').posix;
const program = require('commander');
const _prompt = require('inquirer').prompt;

const logger = require('./util/log');

/*const validate_action = require('./controller/validate');*/
const am_actions = require('./controller/am');
const cb_actions = require('./controller/cb');
const vcs_actions = require('./controller/vcs');
const config_actions = require('./controller/config');
const push_folder_asset_action = require('./controller/custom/push_folder_asset');
const workspace_finder = require('./util/workspace_finder');
const auth_actions = require('./controller/auth');
const pack = require('./package.json');

const bilrost_starter = require('./util/bilrost_starter');

const are_you_sure = [
    {
        type: 'input',
        name: 'are_you_sure',
        message: 'This will remove resources and subscription/stage lists.\n Are you sure this is what you want?\n input y/n to answer'
    }
];

const start_bilrost_if_not_running = callback => {
    return function () {
        const args = Array.from(arguments);
        return bilrost_starter.start_if_not_running(9224, () => callback.apply(null, args), program.bilrostOutput)
            .catch(err => {
                if (err) {
                    logger.spawn_error(err);
                }
                process.exit();
            });
    };
};

function list(val) {
    return val.split(',');
}

// CLI
function resolve_path(path) {
    return Path.join(process.cwd().replace(/\\/g, '/'), path);
}

function help() {
    console.info('');
    console.info('Bilrost CLI  v', program.version());
    program.help();
}

const find_workspace_url = (pwd = program.pwd) => {
    try {
        return workspace_finder(pwd);
    } catch(err) {
        throw err;
    }
};

const resolve_asset_ref = (ref = '')  => {
    if (ref.startsWith('/assets/')) {
        return ref;
    } else {
        return `/assets/${ref.replace(/\\/g, '/')}`;
    }
};

const resolve_resource_ref = (ref = '') => {
    if (ref.startsWith('/resources/')) {
        return ref;
    } else {
        return `/resources/${ref.replace(/\\/g, '/')}`;
    }
};

const resolve_resource_refs_in_object = obj => Object.keys(obj)
    .reduce((acc, key) => {
        const value = obj[key];
        if (typeof value === 'string') {
            acc[key] = resolve_resource_ref(value);
        } else if (value instanceof Array) {
            acc[key] = value.map(resolve_resource_ref);
        }
        return acc;
    }, {});

program
    .version(pack.version)
    .option('-P, --pwd <relative>', 'Specify [relative] path of the folder to parse from this location', resolve_path, process.cwd())
    .option('-O, --output <filename>', 'Output a [filename] log file')
    .option('-B, --bilrost-output', 'Display bilrost output');

program.command(' -- ');

program
    .command('whoami')
    .description('Retrieve user information if connected')
    .action(start_bilrost_if_not_running(() => auth_actions.whoami()));

program
    .command('login')
    .description('Authenticate user')
    .on('--help', () => {
        console.log();
        console.log('  Behaviors:');
        console.log();

        console.log('  Prompt signin webpage from favorite web browser if not connected from github. You have 1 minute to login');
        console.log('  Or prompt greeting webpage if not connected with bilrost backend');
    })
    .action(start_bilrost_if_not_running(() => auth_actions.login()));

program
    .command('session <token>')
    .description('Set session token to use to communicate with bilrost back end')
    .action(start_bilrost_if_not_running(auth_actions.session));

program
    .command('logout')
    .description('Log out user from bilrost backend')
    .on('--help', () => {
        console.log();
        console.log('  Behavior:');
        console.log();

        console.log('  The session will terminate and associated token will be lost');
    })
    .action(start_bilrost_if_not_running(() => auth_actions.logout()));

program.command(' -- ');

program
    .command('list-workspaces')
    .alias('ls-workspaces')
    .description('List workspaces available in the favorite list')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-v, --verbose', 'verbose to display asset content')
    .action(start_bilrost_if_not_running(options => cb_actions.list_workspace(options.identifier, options.verbose)))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();

        console.log('  Only one workspace is listed when using identifier option');
    });

program
    .command('add-workspace <identifier> [relative_path]')
    .alias('bookmark')
    .description('Add workspace to the favorite list with an associated name identifier')
    .action(start_bilrost_if_not_running((name, workspace_relative_path) => {
        const workspace_absolute_path = Path.join(program.pwd, workspace_relative_path ? workspace_relative_path : '');
        am_actions.add_workspace_to_favorite(name, workspace_absolute_path);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();

        console.log('  Input identifier can be then used as an argument to apply to commands against associated workspace.');
    });

program
    .command('forget-workspace <identifier>')
    .alias('unbookmark')
    .description('Forget a project from favorite list')
    .action(start_bilrost_if_not_running(am_actions.forget_workspace_in_favorite))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();

        console.log('  Given identifier can be a workspace name or file uri.');
        console.log('  Run "bilrost list-workspaces" to get these identifiers.');
    });

program
    .command('forget-workspaces')
    .alias('unbookmark-all')
    .description('Forget all workspaces')
    .action(start_bilrost_if_not_running(am_actions.forget_workspaces_in_favorite));

program
    .command('create-workspace <relative_path> <organization> <repository> <branch>')
    .description('Create a workspace')
    .option('-d, --description <description>', 'description')
    .action(start_bilrost_if_not_running((workspace_relative_path, organization, repository, branch, options) => {
        const input = {
            path: Path.join(program.pwd, workspace_relative_path ? workspace_relative_path : ''),
            organization: organization,
            project_name: repository,
            branch: branch,
            description: options.description,
            from_repo: true
        };
        return am_actions.create_workspace(input);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  Target directory given from <relative_path> will be created.');
        console.log('  All options are required to be passed');
        console.log();
        console.log('  Example:');
        console.log();
        console.log('  bilrost create-workspace folder_name organization_name project_name -master');
    });

program
    .command('reset-workspace [workspace_relative_path]')
    .description('Reset a workpsace')
    .option('-f, --force', 'force reset without prompt')
    .option('-s, --silent', 'silent error output if workspace not found or invalid')
    .action(start_bilrost_if_not_running((workspace_relative_path, options) => {
        const workspace_absolute_path = Path.join(program.pwd, workspace_relative_path ? workspace_relative_path : '');
        if (options.force) {
            return am_actions.reset_workspace(workspace_absolute_path, options.silent);
        } else {
            return _prompt(are_you_sure)
                .then(answer => {
                    if (answer.are_you_sure === 'y') {
                        return am_actions.reset_workspace(workspace_absolute_path, options.silent);
                    }
                });
        }
    }))
    .on('--help', () => {
        console.log();
        console.log('  WARNING');
        console.log('  You will LOSE some data. All resources, subscription and stage lists are removed.');
    });

program
    .command('delete-workspace <relative_path>')
    .alias('remove-workspace')
    .description('Delete a workspace')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((workspace_relative_path, options) => {
        const workspace_absolute_path = Path.join(program.pwd, workspace_relative_path ? workspace_relative_path : '');
        const identifier = options.identifier || find_workspace_url(workspace_absolute_path);
        return am_actions.delete_workspace(identifier);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  This is not possible to remove workspace if terminal\'s current working directory is root or child of workspace location.');
        console.log();
        console.log('  Given optional identifier can be a workspace name or file uri');
        console.log('  Run "bilrost list-workspaces" to get these identifiers');

    });

program.command(' -- ');

program
    .command('list-assets [asset_reference]')
    .alias('ls-assets')
    .description('List assets')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-v, --verbose', 'verbose to display asset content')
    .action(start_bilrost_if_not_running((reference = '/assets/', options) => { // jshint ignore:line
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        return am_actions.list_asset(identifier, ref, options.verbose);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  Verbose option displays asset contents and namespace references (-v). Only asset/namespace references are shown otherwise, except if the given asset reference is not a namespace');
        console.log('  Asset reference can point to a namespace');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('  "bilrost list-assets" to list all assets/namespaces in root namespace');
        console.log('  "bilrost list-assets namespace/" to list all assets/namespaces within "namespace"');
        console.log('  "bilrost list-assets namespace/bar" to display "bar" asset content');
        console.log('  "bilrost list-assets namespace/bar/ -v" to retrieve all content in "bar" namespace');
    });

program
    .command('create-asset <reference>')
    .description('Create an asset')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-p, --definition-path <asset_definition_file_absolute_path>', 'Absolute path to the file containing the asset definition')
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        return am_actions.create_asset(identifier, ref, options.definitionPath);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  Asset is empty if no definition file path is given');
        console.log('  Use "update" command for feeding empty asset with values');
        console.log('  All key/value pairs are optional in asset definition file');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('  {\n     "main": "/resources/duck.collada",\n     "dependencies": ["/resources/texture.png", "/resources/physics.png"],\n     "tags": ["debug", "duck", "collada"],\n     "comment": "Debug collada file"\n  }');
        console.log('  bilrost create-asset -p C:\\path\\to\\asset_definition.json');
    });

program
    .command('rename-asset <asset_to_rename_reference> <new_reference>')
    .description('Rename an asset')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-v, --verbose', 'verbose to display renamed asset content')
    .option('')
    .action(start_bilrost_if_not_running((reference, new_reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        const new_ref = resolve_asset_ref(new_reference);
        return am_actions.rename_asset(identifier, ref, new_ref, options.verbose);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('  bilrost rename-asset old_foo new_foo');
    });

program
    .command('update-asset <asset_reference>')
    .description('Update an asset')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-m, --main <asset_reference>', 'Update main resource reference')
    .option('-a, --add <deps>', 'Add resource dependency', list)
    .option('-r, --remove <deps>', 'Remove resource dependency', list)
    .option('-c, --comment <comment>', 'Set asset comment field')
/*  .option('-t, --tags <tag>', 'Include a tag to the relative list')
    .option('-s, --semantics <comment>', 'Assign a semantic value to asset')*/
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        options = Object.assign(options, resolve_resource_refs_in_object({
            main: options.main,
            remove: options.remove,
            add: options.add
        }));
        return am_actions.update_asset(identifier, ref, options);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  --add and --remove options can pass lists, each item separated by a "," without whitespaces');
        console.log('  --add and --remove options can points to directories');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('  bilrost update-asset foo --add a\\b,texture.png --remove old_texture_directory --main bar --comment "new_comment"');
    });

program
    .command('delete-asset <asset_reference>')
    .description('Delete an asset given by its reference')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        return am_actions.delete_asset(identifier, ref);
    }));

program.command(' -- ');

program
    .command('list-resources [ref]')
    .alias('ls-resources')
    .description('Browse resources with their asset associations')
    .option('-q, --query <search_entry>')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((ref, options) => {
        const identifier = options.identifier || find_workspace_url();
        ref = resolve_resource_ref(ref);
        return cb_actions.list_resources(identifier, ref, options.query);
    }));

program.command(' -- ');

program
    .command('list-subscriptions')
    .alias('ls-subscriptions')
    .description('Print subscription list')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        return vcs_actions.get_subscription_list(identifier);
    }));

program
    .command('subscribe <asset_reference>')
    .description('Subscribe to an asset')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const type = 'ASSET';
        const ref = resolve_asset_ref(reference);
        return vcs_actions.subscribe(identifier, type, ref);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Example:');
        console.log();
        console.log('  bilrost subscribe /assets/foo');
        /*console.log('  bilrost subscribe NAMESPACE /assets/namespace/');
        console.log('  bilrost subscribe SEARCH cats main:/assets/red_cat');
        console.log('  Latter example searches for assets that contains "cat" in their name and define "/assets/red_cat" as main dependency');*/
    });

program
    .command('unsubscribe <asset_reference>')
    .description('Unsubscribe specific subscription from given descriptor')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        return vcs_actions.unsubscribe(identifier, ref);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  Run "bilrost list-subscriptions" to list all available subs');
        console.log();
    });

program
    .command('reset-subscriptions')
    .description('Reset subscription list')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        return vcs_actions.reset_subscription_list(identifier);
    }));

program.command(' -- ');

program
    .command('list-stage')
    .alias('ls-stage')
    .description('Print stage list')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        return vcs_actions.get_stage_list(identifier);
    }));

program
    .command('stage <asset_reference>')
    .description('Stage asset given by its reference')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        return vcs_actions.stage(identifier, ref);
    }));

program
    .command('unstage <asset_reference>')
    .description('Unstage asset')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((reference, options) => {
        const identifier = options.identifier || find_workspace_url();
        const ref = resolve_asset_ref(reference);
        return vcs_actions.unstage(identifier, ref);
    }));

program
    .command('reset-stage')
    .description('Reset stage list')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        return vcs_actions.reset_stage_list(identifier);
    }));

program.command(' -- ');

program
    .command('status')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-r, --reference <reference>', 'resource reference')
    .description('Print workspace, resource or asset statuses')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        const reference = options.reference;
        return vcs_actions.get_status(identifier, reference);
    }));

program
    .command('push <commit_comment>')
    .description('push staged items')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((comment, options) => {
        const identifier = options.identifier || find_workspace_url();
        return vcs_actions.push(identifier, comment);
    }));


program
    .command('push-folder-asset <reference> <directory_relative_path>')
    .description('push a folder asset')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((reference, directory_relative_path, options) => {
        const identifier = options.identifier || find_workspace_url();
        return push_folder_asset_action(identifier, reference, directory_relative_path);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  This is a fast way to version a directory');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('  bilrost push-folder-asset /assets/duck ./duck');
    });

program.command(' -- ');

program
    .command('list-branches')
    .alias('ls-branches')
    .description('List available branches')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-v, --verbose', 'verbose')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        return cb_actions.list_branches(identifier, options.verbose);
    }))
    .on('--help', () => {
        console.log();
        console.log('  Additional information:');
        console.log();
        console.log('  Output will be the following format without verbose option:');
        console.log('  locals:');
        console.log('      - BRANCH_NAME   <STATUS>');
        console.log('  remotes:');
        console.log('      - BRANCH_NAME');
        console.log();
    });

program
    .command('current-branch')
    .description('Get current branch')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running(options => {
        const identifier = options.identifier || find_workspace_url();
        return cb_actions.get_branch(identifier);
    }));

program
    .command('create-branch <branch_name>')
    .description('Create a branch from current one')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((branch_name, options) => {
        const identifier = options.identifier || find_workspace_url();
        return am_actions.create_branch(identifier, branch_name);
    }));

program
    .command('change-branch <branch_name>')
    .description('Change branch')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .option('-f, --force', 'force branch change without prompt')
    .action(start_bilrost_if_not_running((branch_name, options) => {
        const identifier = options.identifier || find_workspace_url();
        const change_branch = () => am_actions.change_branch(identifier, branch_name);
        if (options.force) {
            return change_branch();
        } else {
            return _prompt(are_you_sure)
                .then(answer => {
                    if (answer.are_you_sure === 'y') {
                        return change_branch();
                    }
                });
        }
    }))
    .on('--help', () => {
        console.log();
        console.log('  WARNING');
        console.log('  You will LOSE your data. All resources will be removed along subscription and stage lists');
    });

program
    .command('remove-branch <branch name>')
    .description('Remove branch')
    .option('-i, --identifier <identifier>', 'workspace identifier')
    .action(start_bilrost_if_not_running((branch_name, options) => {
        const identifier = options.identifier || find_workspace_url();
        return am_actions.remove_branch(identifier, branch_name);
    }));

program.command(' -- ');

program
    .command('get-config <name>')
    .description('Get configuration value')
    .action(start_bilrost_if_not_running(config_actions.get));


program
    .command('get-configs')
    .description('Get all configuration values')
    .action(start_bilrost_if_not_running(config_actions.get_all));

program
    .command('set-config <name> <value>')
    .description('Set a new configuration value')
    .action(start_bilrost_if_not_running(config_actions.set));

program
    .command('del-config <name>')
    .description('Reset a configuration value')
    .action(start_bilrost_if_not_running(config_actions.del));

program.command(' -- ');

program
    .command('help')
    .description("display this help.")
    .action(help);

program.parse(process.argv);

if (!program.args.length) {
    help();
} else if (!~program.commands.map(cmd => cmd._name).indexOf(program.args[program.args.length - 1]._name)) {
    logger.spawn_error('Unknown Command: ' + program.args.join(' '));
    logger.spawn_log('Use `help`');
}

if (program.output) {
    const winston = require('winston');
    winston.add(winston.transports.File, {
        filename: program.output + '.log'
    });
    console.info = function () {
        winston.info.apply(null, arguments);
    };
    console.error = function () {
        winston.error.apply(null, arguments);
    };
    console.warn = function () {
        winston.warn.apply(null, arguments);
    };
}
