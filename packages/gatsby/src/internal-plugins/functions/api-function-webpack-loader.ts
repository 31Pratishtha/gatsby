import { slash } from "gatsby-core-utils"
import type { LoaderDefinition } from "webpack"

const APIFunctionLoader: LoaderDefinition = async function () {
  const params = new URLSearchParams(this.resourceQuery)
  const matchPath = params.get(`matchPath`)

  const modulePath = slash(this.resourcePath)

  return /* javascript */ `
  const preferDefault = m => (m && m.default) || m

  const functionModule = require('${modulePath}');
  const functionToExecute = preferDefault(functionModule);
  const matchPath = '${matchPath}';
  const { match: reachMatch } = require('${require.resolve(
    `@gatsbyjs/reach-router`
  )}');
  const { urlencoded, text, json, raw } = require('${require.resolve(
    `body-parser`
  )}')
  const multer = require('${require.resolve(`multer`)}')
  const { createConfig } = require('${require.resolve(`./config`)}')

  function functionWrapper(req, res) {
    if (matchPath) {
      let functionPath = req.originalUrl

      functionPath = functionPath.replace(new RegExp('^/*' + PREFIX_TO_STRIP), '')
      functionPath = functionPath.replace(new RegExp('^/*api/?'), '')

      const matchResult = reachMatch(matchPath, functionPath)
      if (matchResult) {
        req.params = matchResult.params
        if (req.params['*']) {
          // TODO(v6): Remove this backwards compatability for v3
          req.params['0'] = req.params['*']
        }
      }
    }

    // handle body parsing if request stream was not yet consumed
    const { config } = createConfig(functionModule?.config)
    const middlewares = 
      req.readableEnded 
      ? [] 
      : [
        multer().any(),
        raw(config?.bodyParser?.raw ?? { limit: '100kb' }),
        text(config?.bodyParser?.text ?? { limit: '100kb' }),
        urlencoded(config?.bodyParser?.urlencoded ?? { limit: '100kb', extended: true }),
        json(config?.bodyParser?.json ?? { limit: '100kb' })
      ]

    let i = 0
    function runMiddlewareOrFunction() {
      if (i >= middlewares.length) {
        functionToExecute(req, res);
      } else {
        middlewares[i++](req, res, runMiddlewareOrFunction)
      }
    }


    runMiddlewareOrFunction() 
  }

  module.exports = typeof functionToExecute === 'function' 
    ? {
      default: functionWrapper,
      config: functionModule?.config
    } : functionModule
  `
}

export default APIFunctionLoader
