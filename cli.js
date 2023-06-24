const chalk = require('chalk');
const yargs = require('yargs/yargs');
const fs = require('fs');
const path = require('path');
const pluralize = require('pluralize');

const {
  isLoopBackApp,
  updateFile,
  addImports,
  execute,
  replaceText,
  toPascalCase,
  toCamelCase,
  log,
} = require('./utils');

module.exports = async () => {
  let {
    fuzzy,
    centralFuzzy,
    datasource,
    config,
  } = yargs(process.argv.slice(2)).argv;
  
  const invokedFrom = process.cwd();
  const applicationPath = `${invokedFrom}/src/application.ts`;

  if(config && typeof config === 'string') {
    config = JSON.parse(config);
    centralFuzzy = config.centralFuzzy;
    fuzzy = config.fuzzy;
    datasource = config.datasource;
  }

  if((!fuzzy && !centralFuzzy) || !datasource) {
    throw Error('please pass configs: fuzzy or centralFuzzy and datasource');
  }

  const package = require(`${invokedFrom}/package.json`);

  log(chalk.blue('Confirming if this is a LoopBack 4 project.'));
  if (!isLoopBackApp(package)) throw Error('Not a loopback project');

  /*******Creating Centeral fuzzy search*******/
  if(centralFuzzy) {
    const controllerDirPath = `${invokedFrom}/src/controllers`;
    if (!fs.existsSync(controllerDirPath)) fs.mkdirSync(controllerDirPath);
    const controllerPath = `${controllerDirPath}/fuzzy-search.controller.ts`;
    log(chalk.blue('Creating fuzzy search controller.'));
    fs.copyFileSync(path.join(__dirname, './text-codes/fuzzy-search.controller.ts.txt'), controllerPath);
    // replacing the datasource provided
    replaceText(controllerPath, 'DbDataSource', datasource,);
    
    // exporting central fuzzy-search endpoint from controllers/index.ts
    const controllerIndexPath = `${invokedFrom}/src/controllers/index.ts`;
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
    
    const deps = package.dependencies;
    const pkg = 'fuse.js';
    if (!deps[pkg]) {
      execute(`npm i ${pkg}`, `Installing ${pkg}`, 'installing fues.js');
    }
    await generateServices(invokedFrom);
    log(chalk.bold(chalk.green('Successfully generated central fuzzy search API.')));
  }

  /*******Creating fuzzy search for each route*******/
  if(fuzzy) {
    log(chalk.blue('***Generating fuzzy endpoint for each controller***'));
    // reading models
    const modelDirPath = `${invokedFrom}/src/models`;
    const fileNames = fs.readdirSync(modelDirPath);
    const modelNames = [];
    fileNames.forEach(fileName => {
      if(fileName !== 'README.md' && fileName !== 'index.ts') {
        const modelName = fileName.split('.model.ts')[0];
        modelNames.push(modelName);
      }
    });
    if(!modelNames.length) {
      throw Error('No model found. Please run the cli after generating models.');
    }
    modelNames.forEach(modelName => {
      if (!fs.existsSync(`${invokedFrom}/src/repositories/${modelName}.repository.ts`)) {
        throw Error(`Repository for ${modelName} model is not found. Please run the cli after generating repositories.`);
      }
    });
    modelNames.forEach(model => {
      const controller = `${model}.fuzzy`;
      const eachControllerPath = `${invokedFrom}/src/controllers/${controller}.controller.ts`;
      let camelCasedModel = model;
      if(camelCasedModel.includes('-')) {
        const replacedModel = camelCasedModel.replaceAll('-', ' ');
        camelCasedModel = toCamelCase(replacedModel);
      }
      const pluralizedModel = pluralize(controller);
      log(chalk.blue(`Generating controller file for ${model}`));
      fs.writeFileSync(eachControllerPath, `import {repository} from '@loopback/repository';`);
      const fuzzySearchAPIWithClass = `
        export class ${toPascalCase(controller)}Controller {
          constructor(
            @repository(${toPascalCase(camelCasedModel)}Repository)
            public ${camelCasedModel}Repository: ${toPascalCase(camelCasedModel)}Repository,
          ) {}
          @get('/${pluralizedModel}/fuzzy/{searchTerm}', {
            responses: {
                '200': {
                  description: 'Array of ${pluralizedModel} model instances',
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
            async fuzzySearch(): Promise<${toPascalCase(camelCasedModel)}[]> {
              return this.${camelCasedModel}Repository.find();
            }
          }
        `;
      updateFile(
        eachControllerPath,
        `import {repository} from '@loopback/repository';`,
        fuzzySearchAPIWithClass,
      );
      addImports(eachControllerPath, [
        `import {${toPascalCase(camelCasedModel)}Repository} from '../repositories';`,
        `import {${toPascalCase(camelCasedModel)}} from '../models';`,
        `import { get, getModelSchemaRef, } from '@loopback/rest';`,
        `import {${toPascalCase(camelCasedModel)}Repository} from '../repositories';`,
        `import {${toPascalCase(camelCasedModel)}} from '../models';`
      ]);
      const controllerIndexPath = `${invokedFrom}/src/controllers/index.ts`;
      if (fs.existsSync(controllerIndexPath)) {
        log(chalk.blue(`Updating controller/index.ts file to add ${controller}`));
        updateFile(
          controllerIndexPath,
          `export`,
          `export * from './${controller}.controller';`,
          true
        );
      } else {
        fs.writeFileSync(controllerIndexPath, `export * from './${controller}.controller';`);
      }
    });
    await generateServices(invokedFrom);
    /*******Creating fuzzy search interceptor under interceptors*******/
    const interceptorPath = `${invokedFrom}/src/interceptors/fuzzy.interceptor.ts`;
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
      // Check if the route contains 'fuzzy' and the result is non-empty array
      if (
        segments.includes('fuzzy') &&
        Array.isArray(result) &&
        result.length > 0 &&
        typeof result[0] === 'object'
      ) {
        const modelProperties = this.getModelProperties(result[0]);
        const options: FuzzySearchOptions = {
          includeScore: true,
          includeMatches: true,
          minMatchCharLength: 3,
          threshold: 0.4,
          ignoreLocation: true,
          keys: modelProperties,
        };
        const searchTerm = segments[segments.indexOf('fuzzy') + 1];
        if (searchTerm) {
          let searchResult = this.FuzzySearchService.search(
            result,
            searchTerm,
            options,
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
      `) { }`,
      `static readonly BINDING_KEY = BindingKey.create<FuzzyInterceptor>(
        'interceptors.FuzzyInterceptor',
      );`
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
}

const generateServices = async (invokedFrom) => {
  log(chalk.blue('****Generating fuzzy search service.****'));
  const servicesPath = `${invokedFrom}/src/services/fuzzy-search.service.ts`;
  if (!fs.existsSync(servicesPath)) {
    execute(`lb4 service --config '{"type": "class", "name": "fuzzySearch", "yes": true}'`, 'generating fuzzy service');
  }
  addImports(servicesPath, [`import Fuse from 'fuse.js';`]);
  updateFile(
    servicesPath,
    `@injectable({scope: BindingScope.TRANSIENT})`,
    `export interface FuzzySearchOptions {
      includeScore?: boolean;
      includeMatches?: boolean;
      minMatchCharLength?: number;
      threshold?: number;
      ignoreLocation?: boolean;
      keys: string[];
    }`,
    true
  );
  updateFile(
    servicesPath,
    `constructor(/* Add @inject to inject parameters */) {}`,
    `search<T>(
      data: T[],
      searchTerm: string,
      options: FuzzySearchOptions,
    ): Fuse.FuseResult<T>[] {
      const fuseIndex = Fuse.createIndex(options.keys, data);
      const fuse = new Fuse(data, options, fuseIndex);
      return fuse.search(searchTerm);
    }`
  );
}