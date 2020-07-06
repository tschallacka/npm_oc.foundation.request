var jQuery = require('jquery');
var $ = jQuery;

var Request = function (element, handler, options) {
    var $el = this.$el = $(element);
    this.options = options || {};
    /*
     * Validate handler name
     */

    if (handler == undefined)
        throw new Error('The request handler name is not specified.')

    if (!handler.match(/^(?:\w+\:{2})?on*/))
        throw new Error('Invalid handler name. The correct handler name format is: "onEvent".')

    /*
     * Custom function, requests confirmation from the user
     */

    function handleConfirmMessage(message) {
        var _event = jQuery.Event('ajaxConfirmMessage')

        _event.promise = $.Deferred()
        if ($(window).triggerHandler(_event, [message]) !== undefined) {
            _event.promise.done(function() {
                options.confirm = null
                new Request(element, handler, options)
            })
            return false
        }

        if (_event.isDefaultPrevented()) return
        if (message) return confirm(message)
    }

    /*
     * Initiate request
     */

    if (options.confirm && !handleConfirmMessage(options.confirm))
        return

    /*
     * Prepare the options and execute the request
     */

    var
        $form = $el.closest('form'),
        $triggerEl = !!$form.length ? $form : $el,
        context = { handler: handler, options: options },
        loading = options.loading !== undefined && options.loading.length ? $(options.loading) : null,
        isRedirect = options.redirect !== undefined && options.redirect.length

    var _event = jQuery.Event('oc.beforeRequest')
    $triggerEl.trigger(_event, context)
    if (_event.isDefaultPrevented()) return

    var data = [$form.serialize()]

    $.each($el.parents('[data-request-data]').toArray().reverse(), function extendRequest() {
        data.push($.param(paramToObj('data-request-data', $(this).data('request-data'))))
    })

    if ($el.is(':input') && !$form.length) {
        var inputName = $el.attr('name')
        if (inputName !== undefined && options.data[inputName] === undefined)
            options.data[inputName] = $el.val()
    }

    if (options.data !== undefined && !$.isEmptyObject(options.data))
        data.push($.param(options.data))

    var requestHeaders = {};
    requestHeaders[Request.PROPERTIES.REQUEST_HANDLER] = handler;
    requestHeaders[Request.PROPERTIES.REQUEST_PARTIALS] = this.extractPartials(options.update);

    if (options.flash !== undefined) {
        requestHeaders[Request.PROPERTIES.REQUEST_FLASH] = 1
    }
    var x = new Date();
    var randomPrefix = window.location.href.indexOf('?') === -1 ? '?':'&';
    var requestOptions = {
        url: window.location.href + randomPrefix +'random='+[x.getDate(),x.getMonth(),x.getYear(),x.getMilliseconds(),Math.floor(Math.random()*1000)+1].join(''),
        context: context,
        headers: requestHeaders,
        success: function(data, textStatus, jqXHR) {
            /*
             * Halt here if beforeUpdate() or data-request-before-update returns false
             */
            if (this.options.beforeUpdate.apply(this, [data, textStatus, jqXHR]) === false) return
            if (options.evalBeforeUpdate && eval('(function($el, context, data, textStatus, jqXHR) {'+options.evalBeforeUpdate+'}.call($el.get(0), $el, context, data, textStatus, jqXHR))') === false) return

            /*
             * Trigger 'ajaxBeforeUpdate' on the form, halt if event.preventDefault() is called
             */
            var _event = jQuery.Event('ajaxBeforeUpdate')
            $triggerEl.trigger(_event, [context, data, textStatus, jqXHR])
            if (_event.isDefaultPrevented()) return

            /*
             * Proceed with the update process
             */
            var updatePromise = requestOptions.handleUpdateResponse(data, textStatus, jqXHR)

            updatePromise.done(function() {
                $triggerEl.trigger('ajaxSuccess', [context, data, textStatus, jqXHR])
                options.evalSuccess && eval('(function($el, context, data, textStatus, jqXHR) {'+options.evalSuccess+'}.call($el.get(0), $el, context, data, textStatus, jqXHR))')
            })

            return updatePromise
        },
        error: function(jqXHR, textStatus, errorThrown) {
            var errorMsg,
                updatePromise = $.Deferred();

            if ((window.ocUnloading !== undefined && window.ocUnloading) || errorThrown == 'abort')
                return;

            /*
             * Disable redirects
             */
            isRedirect = false;
            options.redirect = null;

            /*
             * Error 406 is a "smart error" that returns response object that is
             * processed in the same fashion as a successful response.
             */
            if (jqXHR.status == 406 && jqXHR.responseJSON) {
                errorMsg = jqXHR.responseJSON[Request.PROPERTIES.ERROR_MESSAGE];
                updatePromise = requestOptions.handleUpdateResponse(jqXHR.responseJSON, textStatus, jqXHR);
            }
            /*
             * Standard error with standard response text
             */
            else {
                errorMsg = jqXHR.responseText ? jqXHR.responseText : jqXHR.statusText;
                updatePromise.resolve();
            }

            updatePromise.done(function() {
                $el.data('error-message', errorMsg);

                /*
                 * Trigger 'ajaxError' on the form, halt if event.preventDefault() is called
                 */
                var _event = jQuery.Event('ajaxError')
                $triggerEl.trigger(_event, [context, errorMsg, textStatus, jqXHR])
                if (_event.isDefaultPrevented()) return

                /*
                 * Halt here if the data-request-error attribute returns false
                 */
                if (options.evalError && eval('(function($el, context, errorMsg, textStatus, jqXHR) {'+options.evalError+'}.call($el.get(0), $el, context, errorMsg, textStatus, jqXHR))') === false)
                    return

                requestOptions.handleErrorMessage(errorMsg)
            })

            return updatePromise
        },
        complete: function(data, textStatus, jqXHR) {
            $triggerEl.trigger('ajaxComplete', [context, data, textStatus, jqXHR])
            options.evalComplete && eval('(function($el, context, data, textStatus, jqXHR) {'+options.evalComplete+'}.call($el.get(0), $el, context, data, textStatus, jqXHR))')
        },

        /*
         * Custom function, display an error message to the user
         */
        handleErrorMessage: function(message) {
            var _event = jQuery.Event('ajaxErrorMessage')
            $(window).trigger(_event, [message])
            if (_event.isDefaultPrevented()) return
            if (message) console.error(message);
        },

        /*
         * Custom function, handle any application specific response values
         * Using a promisary object here in case injected assets need time to load
         */
        handleUpdateResponse: function(data, textStatus, jqXHR) {
            /*
             * Update partials and finish request
             */
            var updatePromise = $.Deferred().done(function() {
                for (var partial in data) {
                    /*
                     * If a partial has been supplied on the client side that matches the server supplied key, look up
                     * it's selector and use that. If not, we assume it is an explicit selector reference.
                     */
                    var selector = (options.update[partial]) ? options.update[partial] : partial
                    if (jQuery.type(selector) == 'string' && selector.charAt(0) == '@') {
                        $(selector.substring(1)).append(data[partial]).trigger('ajaxUpdate', [context, data, textStatus, jqXHR])
                    } else if (jQuery.type(selector) == 'string' && selector.charAt(0) == '^') {
                        $(selector.substring(1)).prepend(data[partial]).trigger('ajaxUpdate', [context, data, textStatus, jqXHR])
                    } else {
                        $(selector).trigger('ajaxBeforeReplace')
                        $(selector).html(data[partial]).trigger('ajaxUpdate', [context, data, textStatus, jqXHR])
                    }
                }

                /*
                 * Wait for .html() method to finish rendering from partial updates
                 */
                setTimeout(function() {
                    $(window)
                        .trigger('ajaxUpdateComplete', [context, data, textStatus, jqXHR])
                        .trigger('resize')
                }, 0)
            })

            /*
             * Handle redirect
             */
            if (data[Request.PROPERTIES.REDIRECT]) {
                options.redirect = data[Request.PROPERTIES.REDIRECT];
                isRedirect = true;
            }

            if (isRedirect)
                window.location.href = options.redirect;

            /*
             * Focus fields with errors
             */
            if (data[Request.PROPERTIES.ERROR_FIELDS]) {
                $triggerEl.trigger('ajaxValidation', [context, data[Request.PROPERTIES.ERROR_MESSAGE], data[Request.PROPERTIES.ERROR_FIELDS]])

                var isFirstInvalidField = true
                $.each(data[Request.PROPERTIES.ERROR_FIELDS], function focusErrorField(fieldName, fieldMessages) {
                    var fieldElement = $form.find('[name="'+fieldName+'"], [name="'+fieldName+'[]"], [name$="['+fieldName+']"], [name$="['+fieldName+'][]"]').filter(':enabled').first()
                    if (fieldElement.length > 0) {

                        var _event = jQuery.Event('ajaxInvalidField')
                        $(window).trigger(_event, [fieldElement.get(0), fieldName, fieldMessages, isFirstInvalidField])

                        if (isFirstInvalidField) {
                            if (!_event.isDefaultPrevented()) fieldElement.focus()
                            isFirstInvalidField = false
                        }
                    }
                })
            }

            /*
             * Handle asset injection
             */
             if (data[Request.PROPERTIES.ASSETS]) {
                window.assetManager.load(data[Request.PROPERTIES.ASSETS], $.proxy(updatePromise.resolve, updatePromise))
             }
             else {
                updatePromise.resolve()
            }

            return updatePromise
        }
    }

    /*
     * Allow default business logic to be called from user functions
     */
    context.success = requestOptions.success
    context.error = requestOptions.error
    context.complete = requestOptions.complete
    requestOptions = $.extend(requestOptions, options)

    requestOptions.data = data.join('&');

    if (loading) loading.show()

    $(window).trigger('ajaxBeforeSend', [context])
    $el.trigger('ajaxPromise', [context])
    return $.ajax(requestOptions)
        .fail(function(jqXHR, textStatus, errorThrown) {
            if (!isRedirect) {
                $el.trigger('ajaxFail', [context, textStatus, jqXHR])
                if (loading) loading.hide()
            }
        })
        .done(function(data, textStatus, jqXHR) {
            if (!isRedirect) {
                $el.trigger('ajaxDone', [context, data, textStatus, jqXHR])
                if (loading) loading.hide()
            }
        })
        .always(function(dataOrXhr, textStatus, xhrOrError) {
            $el.trigger('ajaxAlways', [context, dataOrXhr, textStatus, xhrOrError])
        })
}

/**
 * You can overwrite these with your own if you wish
 * var request = require('@tschallacka/oc.foundation.request);
 * request.PROPERTIES.REDIRECT = 'LivingDaVidaLoca';
 **/
Request.PROPERTIES = {
    REQUEST_HANDLER: 'X-OCTOBER-REQUEST-HANDLER',
    REQUEST_PARTIALS: 'X-OCTOBER-REQUEST-PARTIALS',
    REQUEST_FLASH: 'X-OCTOBER-REQUEST-FLASH',
    ASSETS: 'X_OCTOBER_ASSETS',
    ERROR_FIELDS: 'X_OCTOBER_ERROR_FIELDS',
    ERROR_MESSAGE: 'X_OCTOBER_ERROR_MESSAGE',
    REDIRECT: 'X_OCTOBER_REDIRECT',
}
Request.DEFAULTS = {
    update: {},
    type : 'POST',
    beforeUpdate: function(data, textStatus, jqXHR) {},
    evalBeforeUpdate: null,
    
    evalSuccess: null,
    evalError: null,
    evalComplete: null,
}

/*
 * Internal function, build a string of partials and their update elements.
 */
Request.prototype.extractPartials = function(update) {
    var result = []
    for (var partial in update)
        result.push(partial)

    return result.join('&')
}

module.exports = Request;