const setSourcesForPicture = function(element, srcsetDataAttribute) {
    const parent = element.parentElement;
    if (parent.tagName !== "PICTURE") {
        return;
    }
    for (let i = 0; i < parent.children.length; i++) {
        let pictureChild = parent.children[i];
        if (pictureChild.tagName === "SOURCE") {
            let sourceSrcset = pictureChild.dataset[srcsetDataAttribute];
            if (sourceSrcset) {
                pictureChild.setAttribute("srcset", sourceSrcset);
            }
        }
    }
};
const setSources = function(element, srcsetDataAttribute, srcDataAttribute) {
    const tagName = element.tagName;
    const elementSrc = element.dataset[srcDataAttribute];
    if (tagName === "IMG") {
        setSourcesForPicture(element, srcsetDataAttribute);
        const imgSrcset = element.dataset[srcsetDataAttribute];
        if (imgSrcset) { element.setAttribute("srcset", imgSrcset); }
        if (elementSrc) { element.setAttribute("src", elementSrc); }
        return;
    }
    if (tagName === "IFRAME") {
        if (elementSrc) { element.setAttribute("src", elementSrc); }
        return;
    }
    if (elementSrc) { element.style.backgroundImage = "url(" + elementSrc + ")"; }
};

const defaultSettings = {
    elements_selector: "img",
    container: window,
    threshold: 300,
    throttle: 150,
    data_src: "original",
    data_srcset: "originalSet",
    class_loading: "loading",
    class_loaded: "loaded",
    class_error: "error",
    class_initial: "initial",
    skip_invisible: true,
    callback_load: null,
    callback_error: null,
    callback_set: null,
    callback_processed: null
}
const callCallback = function (callback, argument) {
    if (callback) { callback(argument); }
};

// TODO: expand srollable container, not just window.
function isInsideViewport(element) {
  var rect = element.getBoundingClientRect();
  var html = document.documentElement;
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || html.clientHeight) &&
    rect.right <= (window.innerWidth || html.clientWidth)
  );
}

/*
 * Constructor
 */ 

const LazyLoad = function(instanceSettings) {
    this._settings = Object.assign({}, defaultSettings, instanceSettings);
    
    this._previousLoopTime = 0;
    this._loopTimeout = null;
    this._boundHandleScroll = this.handleScroll.bind(this);

    this._isFirstLoop = true;
    window.addEventListener("resize", this._boundHandleScroll);
    this.update();
};

LazyLoad.prototype = {
    
    /*
     * Private methods
     */

    _reveal: function (element) {
        const settings = this._settings;

        const errorCallback = function () {
            /* As this method is asynchronous, it must be protected against external destroy() calls */
            if (!settings) { return; }
            element.removeEventListener("load", loadCallback);
            element.removeEventListener("error", errorCallback);
            element.classList.remove(settings.class_loading);
            element.classList.add(settings.class_error);
            callCallback(settings.callback_error, element);
        };

        const loadCallback = function () {
            /* As this method is asynchronous, it must be protected against external destroy() calls */
            if (!settings) { return; }
            element.classList.remove(settings.class_loading);
            element.classList.add(settings.class_loaded);
            element.removeEventListener("load", loadCallback);
            element.removeEventListener("error", errorCallback);
            /* Calling LOAD callback */
            callCallback(settings.callback_load, element);
        };

        if (element.tagName === "IMG" || element.tagName === "IFRAME") {
            element.addEventListener("load", loadCallback);
            element.addEventListener("error", errorCallback);
            element.classList.add(settings.class_loading);
        }

        setSources(element, settings.data_srcset, settings.data_src);
        /* Calling SET callback */
        callCallback(settings.callback_set, element);
    },

    _loopThroughElements: function () {
        const settings = this._settings,
            elements = this._elements,
            elementsLength = (!elements) ? 0 : elements.length;
        let i,
            processedIndexes = [],
            firstLoop = this._isFirstLoop;

        for (i = 0; i < elementsLength; i++) {
            let element = elements[i];
            /* If must skip_invisible and element is invisible, skip it */
            if (settings.skip_invisible && (element.offsetParent === null)) {
                continue;
            }
            
            if (isInsideViewport(element, settings.container, settings.threshold)) {
                if (firstLoop) {
                    element.classList.add(settings.class_initial);
                }
                /* Start loading the image */
                this._reveal(element);
                /* Marking the element as processed. */
                processedIndexes.push(i);
                element.dataset.wasProcessed = true;
            }
        }
        /* Removing processed elements from this._elements. */
        while (processedIndexes.length > 0) {
            elements.splice(processedIndexes.pop(), 1);
            /* Calling the end loop callback */
            callCallback(settings.callback_processed, elements.length);
        }
        /* Stop listening to scroll event when 0 elements remains */
        if (elementsLength === 0) {
            this._stopScrollHandler();
        }
        /* Sets isFirstLoop to false */
        if (firstLoop) {
            this._isFirstLoop = false;
        }
    },

    _purgeElements: function () {
        const elements = this._elements,
            elementsLength = elements.length;
        let i,
            elementsToPurge = [];

        for (i = 0; i < elementsLength; i++) {
            let element = elements[i];
            /* If the element has already been processed, skip it */
            if (element.dataset.wasProcessed) {
                elementsToPurge.push(i);
            }
        }
        /* Removing elements to purge from this._elements. */
        while (elementsToPurge.length > 0) {
            elements.splice(elementsToPurge.pop(), 1);
        }
    },

    _startScrollHandler: function () {
        if (!this._isHandlingScroll) {
            this._isHandlingScroll = true;
            this._settings.container.addEventListener("scroll", this._boundHandleScroll);
        }
    },

    _stopScrollHandler: function () {
        if (this._isHandlingScroll) {
            this._isHandlingScroll = false;
            this._settings.container.removeEventListener("scroll", this._boundHandleScroll);
        }
    },

    /* 
     * Public methods
     */

    handleScroll: function () {
        const throttle = this._settings.throttle;

        if (throttle !== 0) {
            const getTime = () => { (new Date()).getTime(); };
            let now = getTime();
            let remainingTime = throttle - (now - this._previousLoopTime);
            if (remainingTime <= 0 || remainingTime > throttle) {
                if (this._loopTimeout) {
                    clearTimeout(this._loopTimeout);
                    this._loopTimeout = null;
                }
                this._previousLoopTime = now;
                this._loopThroughElements();
            } else if (!this._loopTimeout) {
                this._loopTimeout = setTimeout(function () {
                    this._previousLoopTime = getTime();
                    this._loopTimeout = null;
                    this._loopThroughElements();
                }.bind(this), remainingTime);
            }
        } else {
            this._loopThroughElements();
        }
    },

    update: function () {
        // Converts to array the nodeset obtained querying the DOM from with elements_selector
        this._elements = Array.prototype.slice.call(document.querySelectorAll(this._settings.elements_selector));
        this._purgeElements();
        this._loopThroughElements();
        this._startScrollHandler();
    },

    destroy: function () {
        window.removeEventListener("resize", this._boundHandleScroll);
        if (this._loopTimeout) {
            clearTimeout(this._loopTimeout);
            this._loopTimeout = null;
        }
        this._stopScrollHandler();
        this._elements = null;
        this._settings = null;
    }
}


export default LazyLoad;