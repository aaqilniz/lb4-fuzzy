# lb4-fuzzy

This is a basic CLI utility to add fuzzy search feature to a loopback 4 application.

## Installation

Run the following command to install the CLI.

```
$ npm install -g lb4-fuzzy
```

## Prerequisites

- Run the cli in a LoopBack 4 project.
- Run the cli after the models and their repositories are already generated.


## Basic Use

Run `lb4-fuzzy --fuzzy true --centralFuzzy true --datasource localsource` or `lb4-fuzzy --config '{"fuzzy": true, "centralFuzzy": true, "datasource": "localsource"}'` generate fuzzy APIs.

### Options

- fuzzy: to generate fuzzy APIs for each controller available in the app
- centralFuzzy: to generate a central fuzzy api
- datasource: provide the datasource

## APIs generated

- for each controller, a new route /{plularized-model-name}/fuzzy/{search-term} is generated
- for central fuzzy endpoint, a new route /central-f/{search-term} is generated

## License

ISC
