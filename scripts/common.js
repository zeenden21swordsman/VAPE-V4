/** This file contains common JavaScript constructs used by the Photoshop
native extension implementation.
*/

// --------------------------------------------------------------------------------

/** Convert an (error) value to string. This conversion uses JSON for objects and arrays
*/
function _internalToString(value) {
    try {
        if (typeof value == "object")
            return JSON.stringify(value);
        }
    catch (error) {
        _ps_emit_error(`cannot JSON.stringify(${ value })`, error, value);
        }
    // use toString where possible otherwise coerce to string
    return value?.toString() ?? (value + '');
}

// --------------------------------------------------------------------------------

/** Create list of arguments to be used when invoking a JavaScript target function.
*/
function _internalCreateJSArguments(theArgs, fixedArgCount) {
    let jsArgs = [];
    let varArgCount = theArgs.length - fixedArgCount;
    for (index = 0; index < varArgCount; ++index) {
        jsArgs.push(theArgs[index + fixedArgCount]);
    }
    return jsArgs;
}

// --------------------------------------------------------------------------------

/** Wrapper function used by javascript callbacks from Photoshop.
Main purpose is to catch and discard top level errors.
*/
async function _internalCallbackWrapper(jsFunction, errorHandler) {
    try {
        let jsArgs = _internalCreateJSArguments(arguments, 2);
        await jsFunction(...jsArgs);
    }
    catch (error) {
        _ps_emit_error(`Uncaught exception discarded`, error, jsFunction);
        
        if (errorHandler != undefined) {
            errorHandler(error)
        }
    }
}

// --------------------------------------------------------------------------------

/** Wrapper function used by executeAsModal to track the state of a target
*/
async function _internalExecuteAsModalWrapper(jsFunction, executionControl) {
    try {
        let jsArgs = _internalCreateJSArguments(arguments, 2);
        jsArgs.unshift(executionControl);
        let result = await jsFunction(...jsArgs);
        executionControl.resolve(result)
    }
    catch (error) {
        // NAPI cannot handle objects of type Error
        if (error instanceof Error){
            error = error.toString();
            /* NOTE we currently do NOT want to report this
               can silently discard this error specifically */
        }
        
        executionControl.reject(error);
    }
}

// --------------------------------------------------------------------------------

function _internalCreateStackTrace() {
    let result = "";
    try {
        let e = new Error;
        let stackTxt = e.stack;
		let frameList = stackTxt.split("\n");
		for (line of frameList) {
			if (!line.includes("_internalCreateStackTrace")) {
				if (result != "")
					result += "\n"
				result += line;
			}
		}
    }
    catch (error) {
        _ps_emit_error(`cannot create stack trace`, error, result);
    }
    return result;
}

// --------------------------------------------------------------------------------

/** Wrapper function used to route messages from core to the console of the active context
*/
async function _internalLogMessageWrapper(category, message) {
    try {
        let messageStr = _internalToString(message);
        if (category == "warning") {
            console.warn(messageStr);
        }
        else if (category == "error") {
            console.error(messageStr);
        }
        else {
            console.log(messageStr);
        }
    }
    catch (error) {
        _ps_emit_error(`_internalLogMessageWrapper failed`, error, {category, message});
    }
}

// --------------------------------------------------------------------------------
// Create an instance of a pre-defined javascript class
function _internalCreateInstance(className) {
    let result = undefined;
    if (className == "PhotoshopImageData") {
        result = class PhotoshopImageData { };
    }
    return result;
}

// --------------------------------------------------------------------------------

/** Setup of environment for script files
*/
async function _internalSetupScriptFile() {
    window.app = require("photoshop").app;
    window.constants = require("photoshop").constants;
}

/* 
 * generic handling and dispatching of common.js/internal errors
 * usage like example:
 * globalThis.addEventListener('ps-internal-error', function _handleError(event){
     const { type, detail } = event;
     console.log(type, detail); 
     debugger; 
   });
 */
function _ps_emit_error(message='PS Internal Error', cause=null, value){
    const error = new PsInternalError(message, {cause, value});
    error.log();
    error.dispatch();
    return error;
}

class PsInternalError extends Error{
    constructor(message='', options){
        const cause = options?.cause ?? null;
        const value = options?.value ?? undefined;
        let msg = [message+';'];
        msg.push(
            (cause?.message ?? cause?.toString() ?? (cause + ''))
            ,(value?.toString() ?? (value + ''))
        );
        super(msg.join(' '), options);
        this.value = value;
    }
    log(){
        const {cause, value} = this;
        console.error(this, {cause, value, error: this});
    }
    dispatch(target=globalThis, options){
        const event = new CustomEvent('ps-internal-error', {...options, detail: this});
        target.dispatchEvent( event );
        return event;
    }
}
