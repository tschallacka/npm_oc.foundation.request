Request helper for the October Foundation Framework

installation:

     npm install @tschallacka/oc.foundation.request

settings:
 
Default the OctoberCMS handlers are used.  
You can can overwrite these to use your own header handlers.

    var Request = require('@tschallacka/oc.foundation.request');
    /**
     * Headers to be interpreted by the server side code.
     */
    Request.PROPERTIES.REQUEST_HANDLER = 'X-MYHANDLER-REQUEST-HANDLER';
    Request.PROPERTIES.REQUEST_PARTIALS = 'X-MYHANDLER-REQUEST-PARTIALS';
    Request.PROPERTIES.REQUEST_FLASH = 'X-MYHANDLER-REQUEST-FLASH';
    
    /**
     * Returned properties from request
     */
    Request.PROPERTIES.ASSETS: 'X_MYHANDLER_ASSETS',
    Request.PROPERTIES.ERROR_FIELDS: 'X_MYHANDLER_ERROR_FIELDS',
    Request.PROPERTIES.ERROR_MESSAGE: 'X_MYHANDLER_ERROR_MESSAGE',
    Request.PROPERTIES.REDIRECT: 'X_MYHANDLER_REDIRECT',
    
See the jQuery request framework at https://github.com/tschallacka/npm_jquery.request that uses this.
