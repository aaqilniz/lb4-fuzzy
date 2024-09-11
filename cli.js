const chalk = require('chalk');
const yargs = require('yargs/yargs');
const fs = require('fs');
const path = require('path');
const pluralize = require('pluralize');

const {
  isLoopBackApp,
  updateFile,
  shouldUpdate,
  addImports,
  execute,
  replaceText,
  toPascalCase,
  toCamelCase,
  formatCode,
  log,
} = require('./utils');

const filesChanged = new Set();

module.exports = async () => {
  let {
    fuzzy,
    centralFuzzy,
    datasource,
    appName,
    exclude,
    include,
    config,
  } = yargs(process.argv.slice(2)).argv;
  let servicesGenerated = false;
  const invokedFrom = process.cwd();

  if (config && typeof config === 'string') {
    config = JSON.parse(config);
    centralFuzzy = config.centralFuzzy;
    fuzzy = config.fuzzy;
    datasource = config.datasource;
    appName = config.appName;
    include = config.include;
    exclude = config.exclude;
  }

  let includings = [];
  let excludings = [];

  if ((!fuzzy && !centralFuzzy) || !datasource || !appName) {
    throw Error('please pass configs: fuzzy or centralFuzzy, datasource and appName');
  }
  if (exclude && include) throw Error('We cannot have include and exclude at the same time.');

  if (include) { includings = include.split(','); }
  if (exclude) { excludings = exclude.split(','); }

  const package = require(`${invokedFrom}/package.json`);

  log(chalk.blue('Confirming if this is a LoopBack 4 project.'));
  if (!isLoopBackApp(package)) throw Error('Not a loopback project');
  const deps = package.dependencies;
  const fusePacakge = 'fuse.js';
  const pluralizePacakge = 'pluralize';
  const pluralizeTypePacakge = '@types/pluralize';
  if (!deps[fusePacakge]) {
    execute(`npm i ${fusePacakge}`, `Installing ${fusePacakge}`);
  }
  if (!deps[pluralizePacakge]) {
    execute(`npm i ${pluralizePacakge}`, `Installing ${pluralizePacakge}`);
  }
  if (!deps[pluralizeTypePacakge]) {
    execute(`npm i ${pluralizeTypePacakge}`, `Installing ${pluralizeTypePacakge}`);
  }
  /*******Creating Centeral fuzzy search*******/
  if (centralFuzzy) {
    const controllerDirPath = `${invokedFrom}/src/controllers`;
    if (!fs.existsSync(controllerDirPath)) fs.mkdirSync(controllerDirPath);
    const controllerPath = `${controllerDirPath}/fuzzy-search.controller.ts`;
    filesChanged.add(controllerPath);
    log(chalk.blue('Creating fuzzy search controller.'));

    const centralControllerTemplatePath = path.join(__dirname, './text-codes/fuzzy-search.controller.ts.txt');
    fs.copyFileSync(centralControllerTemplatePath, controllerPath);

    replaceText(controllerPath, 'ApplicationClassNameHere', `${appName}Application`, true);

    // exporting central fuzzy-search endpoint from controllers/index.ts
    const controllerIndexPath = `${invokedFrom}/src/controllers/index.ts`;
    filesChanged.add(controllerIndexPath);
    if (!fs.existsSync(controllerIndexPath)) {
      fs.writeFileSync(controllerIndexPath, 'export * from \'./fuzzy-search.controller\';');
    } else {
      updateFile(
        controllerIndexPath,
        'export',
        'export * from \'./fuzzy-search.controller\';',
        true
      );
    }
    await generateServices(invokedFrom);
    servicesGenerated = true;
    log(chalk.bold(chalk.green('Successfully generated central fuzzy search API.')));
  }
  /*******Creating fuzzy search for each route*******/
  if (fuzzy) {
    log(chalk.blue('***Generating fuzzy endpoint for each controller***'));
    // reading models
    const modelDirPath = `${invokedFrom}/src/models`;
    const fileNames = fs.readdirSync(modelDirPath);
    const controllerIndexPath = `${invokedFrom}/src/controllers/index.ts`;
    const repoDirPath = `${invokedFrom}/src/repositories`;
    const repoFileNames = fs.readdirSync(repoDirPath);

    const modelNames = [];
    fileNames.forEach(fileName => {
      if (fileName !== 'README.md' && fileName !== 'index.ts') {
        const modelName = fileName.split('.model.ts')[0];
        repoFileNames.forEach(fileName => {
          if (fileName !== 'README.md' && fileName !== 'index.ts') {
            const modelName = fileName.split('.repository.ts')[0];
            const repoContent = fs.readFileSync(`${repoDirPath}/${fileName}`, 'utf8');
            if (repoContent.includes(datasource)) {
              modelNames.push(modelName);
            }
          }
        });
      }
    });
    if (!modelNames.length) {
      throw Error('No model found. Please run the cli after generating models.');
    }
    modelNames.forEach(modelName => {
      if (!fs.existsSync(`${invokedFrom}/src/repositories/${modelName}.repository.ts`)) {
        throw Error(`Repository for ${modelName} model is not found. Please run the cli after generating repositories.`);
      }
    });
    let modelsToGenerate = [];
    if (!includings.length && !excludings.length) {
      modelsToGenerate = modelNames;
    } else {
      modelNames.forEach(model => {
        if (includings.length && includings.includes(model)) modelsToGenerate.push(model);
        if (excludings.length && !excludings.includes(model)) modelsToGenerate.push(model);
      });
    }
    modelsToGenerate.forEach(model => {
      const modelWithPrefix = `fuzzy-${model}`
      const eachControllerPath = `${invokedFrom}/src/controllers/${modelWithPrefix}.controller.ts`;

      filesChanged.add(eachControllerPath);
      const uri = model;
      if (model.includes('-')) {
        model = model.replaceAll('-', ' ');
      }
      let camelCasedModel = toCamelCase(model);
      log(chalk.blue(`Generating controller file for ${modelWithPrefix}`));
      fs.writeFileSync(eachControllerPath, `import {repository,Filter} from '@loopback/repository';`);
      const fuzzySearchAPIWithClass = `
        export class ${toPascalCase(modelWithPrefix)}Controller {
          constructor(
            @repository(${toPascalCase(camelCasedModel)}Repository)
            public ${camelCasedModel}Repository: ${toPascalCase(camelCasedModel)}Repository,
          ) {}
          @get('/${pluralize(uri)}/fuzzy/{searchTerm}', {
            responses: {
                '200': {
                  description: 'Array of ${toPascalCase(camelCasedModel)} model instances',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: getModelSchemaRef(${toPascalCase(camelCasedModel)}, {includeRelations: true}),
                      },
                    },
                  },
                },
              },
            })
            async fuzzySearch(
              @param.path.string('searchTerm') searchTerm: string,
              @param.query.object('filter') filter: Filter,
              ): Promise<${toPascalCase(camelCasedModel)}[]> {
                if(!filter) filter = {};
              return this.${camelCasedModel}Repository.find(filter);
            }
          }
        `;
      updateFile(
        eachControllerPath,
        `import {repository,Filter} from '@loopback/repository';`,
        fuzzySearchAPIWithClass,
      );
      addImports(eachControllerPath, [
        `import {${toPascalCase(camelCasedModel)}Repository} from '../repositories';`,
        `import {${toPascalCase(camelCasedModel)}} from '../models';`,
        `import { get, getModelSchemaRef, param, } from '@loopback/rest';`,
        `import {${toPascalCase(camelCasedModel)}Repository} from '../repositories';`,
        `import {${toPascalCase(camelCasedModel)}} from '../models';`
      ]);
      if (fs.existsSync(controllerIndexPath)) {
        log(chalk.blue(`Updating controller/index.ts file to add ${modelWithPrefix}`));
        updateFile(
          controllerIndexPath,
          `export`,
          `export * from './${modelWithPrefix}.controller';`,
          true
        );
      } else {
        fs.writeFileSync(controllerIndexPath, `export * from './${modelWithPrefix}.controller';`);
      }
    });
    if (!servicesGenerated) {
      await generateServices(invokedFrom);
    }
    /*******Creating fuzzy search interceptor under interceptors*******/
    const interceptorPath = `${invokedFrom}/src/interceptors/fuzzy.interceptor.ts`;
    filesChanged.add(interceptorPath);
    if (!fs.existsSync(interceptorPath)) {
      log(chalk.blue('Generating fuzzy interceptor.'));
      execute(`lb4 interceptor --config '{"name": "fuzzy", "global":true, "group": "", "yes": true}'`, 'Generating interceptor');
    }
    replaceText(
      interceptorPath,
      `Interceptor`,
      `Interceptor, inject`
    )
    // adding code to intercept
    updateFile(
      interceptorPath,
      `return result;`,
      `const request = this.requestContext.request;
      const segments = request.path.split('/');
      const threshold = request.query.threshold as  unknown as number;
      const limit = request.query.limit as  unknown as number;
      // Check if the route contains 'fuzzy' and the result is non-empty array
      if (
        segments.indexOf('fuzzy') > 1 &&
        Array.isArray(result) &&
        result.length > 0 &&
        typeof result[0] === 'object'
      ) {
        const modelProperties = this.getModelProperties(result[0]);
        const keys = new Set();

        modelProperties.forEach(key => { keys.add(key); });

        const options: FuzzySearchOptions = {
          includeScore: true,
          includeMatches: true,
          minMatchCharLength: 3,
          ignoreLocation: true,
          useExtendedSearch: true,
          keys: [],
        };

        if (threshold) { options.threshold = threshold; }
        keys.forEach(key => { options.keys.push(key as string); });

        let searchTerm = segments[segments.indexOf('fuzzy') + 1];
        searchTerm = searchTerm.replace(/%20/g, ' ');
        if(searchTerm.split(' ').length > 1) {
          searchTerm = searchTerm.split(' ').map(word => \`=\${word}\`).join(' ');
          searchTerm = searchTerm.replace(/ /g, ' | ');
        }

        if (searchTerm) {
          let searchResult = this.FuzzySearchService.search(
            result,
            searchTerm,
            options,
            limit
          );
          searchResult = searchResult.map((item: any) => {
            return {
              ...item,
              modelName: result[0].constructor.name, // Name of the model
            };
          });
          return searchResult;
        }
      }
      `,
      true
    );
    // adding BINDING_KEY
    updateFile(
      interceptorPath,
      `value() {`,
      `static readonly BINDING_KEY = BindingKey.create<FuzzyInterceptor>(
        'interceptors.FuzzyInterceptor',
      );`,
      true
    );

    // add getModelProperties method
    updateFile(
      interceptorPath,
      `async intercept(`,
      `getModelProperties(modelInstance: Model): string[] {
        const modelClass = modelInstance.constructor as typeof Entity;
        const modelDefinition = modelClass.definition;
        if (!modelDefinition) {
          return [];
        }
        return Object.keys(modelDefinition.properties);
      }`,
      true
    );
    // add constructor
    updateFile(
      interceptorPath,
      `value() {`,
      `constructor(
        @inject('services.FuzzySearchService')
        private FuzzySearchService: FuzzySearchService,
        @inject(RestBindings.Http.CONTEXT)
        private requestContext: RequestContext,
      ) { }`,
      true
    );
    //adding required imports service and BindKey from context
    addImports(interceptorPath, [
      `import {BindingKey} from '@loopback/context';`,
      `import {FuzzySearchOptions, FuzzySearchService} from '../services';`,
      `import {Entity} from '@loopback/repository';`,
      `import {Model, RequestContext, RestBindings} from '@loopback/rest';`
    ]);
    log(chalk.bold(chalk.green('Successfully generated fuzzy search APIs for every controller.')));
  }

  filesChanged.forEach(fileChanged => {
    if (fs.existsSync(fileChanged)) {
      formatCode(fileChanged);
    }
  });
}

const generateServices = async (invokedFrom) => {
  log(chalk.blue('****Generating fuzzy search service.****'));
  const servicesPath = `${invokedFrom}/src/services/fuzzy-search.service.ts`;
  filesChanged.add(servicesPath);
  if (!fs.existsSync(servicesPath)) {
    execute(`lb4 service --config '{"type": "class", "name": "fuzzySearch", "yes": true}'`, 'generating fuzzy service');
  }
  updateFile(
    servicesPath,
    `@injectable({scope: BindingScope.TRANSIENT})`,
    `export interface FuzzySearchOptions {
      includeScore?: boolean;
      includeMatches?: boolean;
      minMatchCharLength?: number;
      useExtendedSearch?: boolean,
      threshold?: number;
      ignoreLocation?: boolean;
      findAllMatches?: boolean;
      shouldSort?: boolean;
      keys: string[];
    }`,
    true
  );
  if (shouldUpdate(servicesPath, 'search<T>(')) {
    updateFile(
      servicesPath,
      `constructor(/* Add @inject to inject parameters */) {}`,
      `search<T>(
        data: T[],
        searchTerm: string,
        options: FuzzySearchOptions,
        limit: number = 100
        ): FuseResult<T>[] {
          if(typeof limit === 'string') {
            limit = +limit;
            if (isNaN(limit)) limit = 100;
          }
          const fuseIndex = Fuse.createIndex(options.keys, data);
          const fuse = new Fuse(data, options, fuseIndex);
          return fuse.search(searchTerm, {limit});
        }`
    );
  }
  if (shouldUpdate(servicesPath, `import Fuse from 'fuse.js';`)) {
    addImports(servicesPath, [`import Fuse from 'fuse.js';`]);
  }
  if (shouldUpdate(servicesPath, `import { FuseResult } from 'fuse.js';`)) {
    addImports(servicesPath, [`import { FuseResult } from 'fuse.js';`]);
  }
}