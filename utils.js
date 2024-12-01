const chalk = require('chalk');
const prettier = require('prettier');
const { execSync } = require('child_process');
const fs = require('fs');

module.exports.log = console.log;

module.exports.kebabCase = string => string
  .replace(/([a-z])([A-Z])/g, "$1-$2")
  .replace(/[\s_]+/g, '-')
  .toLowerCase();

module.exports.toPascalCase = string => string
  .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
  .map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
  .join('');

module.exports.toCamelCase = (string) => string
  .replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
    if (+match === 0) return '';
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });

module.exports.isLoopBackApp = (package) => {
  if (!package) return false;
  const { dependencies } = package;
  if (!dependencies['@loopback/core']) return false;
  return true;
}

module.exports.formatCode = (filePath) => {
  const rawCode = fs.readFileSync(filePath, 'utf8');
  const formatedCode = prettier.format(rawCode, {
    parser: 'typescript',
    singleQuote: true
  });
  fs.writeFileSync(filePath, formatedCode);
}

module.exports.replaceText = (filePath, updateThis, updateWith, replaceAll) => {
  const file = fs.readFileSync(filePath, 'utf8');
  if (file.indexOf(updateWith) === -1) {
    const updatedFile = file[replaceAll ? 'replaceAll' : 'replace'](
      updateThis,
      updateWith
    );
    fs.writeFileSync(filePath, updatedFile, 'utf8');
  }
}

module.exports.updateFile = (filePath, updateThis, updateWith, pre, replaceAll) => {
  const file = fs.readFileSync(filePath, 'utf8');
  if (file.indexOf(updateWith) === -1) {
    const updateWithText = pre ? updateWith + '\n' + updateThis : updateThis + '\n\t' + updateWith;
    this.replaceText(filePath, updateThis, updateWithText, replaceAll);
  }
}

module.exports.shouldUpdate = (filePath, updates) => {
  const file = fs.readFileSync(filePath, 'utf8');
  return !file.includes(updates);
}

module.exports.addImports = (filePath, newImports) => {
  newImports.forEach(newImport => {
    this.updateFile(filePath, 'import', newImport, true);
  });
}

module.exports.execute = (command, message) => {
  this.log(chalk.blue(message));
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (err) {
    throw Error(`failed to execute ${command}`);
  }
}