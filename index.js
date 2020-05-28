const MAX_SIZE_DEFAULT = 1000;
const IS_MAC = navigator.platform.indexOf("Mac") > -1;
window.quillMaxSize = MAX_SIZE_DEFAULT;
window.isQuillActive = false;
window.currentValidations = [];
window.isReadOnly = false;
// Exclude formats that don't match parity with Appian Rich Text Display Field
// Won't be able to paste unsupported formats
// Note this is separate from what toolbar allows
// https://quilljs.com/docs/formats/
// Also see getContentsFromHTML() where unsupported formats are removed
// from the incoming HTML value if present
const availableFormats = [
  ["header", "size"],
  ["bold", "italic", "underline", "strike", "color", "background"],
  ["link", "image"],
  ["align", "indent"],
  ["list"]
];
const availableFormatsFlattened = availableFormats.reduce(function (acc, val) {
  return acc.concat(val, []);
});
var allowedFormats = availableFormatsFlattened;

// This mimics the default Quill.js keyboard module with some slight modifications for 'Tab' handling
// https://github.com/quilljs/quill/blob/master/modules/keyboard.js
var bindings = {
  tab: {
    key: "Tab",
    handler: function(range, context) {
      if (context.collapsed && context.offset !== 0) {
        this.quill.insertText(range.index, "\t", Quill.sources.USER);
        this.quill.setSelection(range.index + 1, Quill.sources.USER);
        return false;
      } else {
        this.quill.format("indent", "+1", Quill.sources.USER);
        return false;
      }
    },
  },
  "custom-ol": {
    key: "7",
    shiftKey: true,
    shortKey: true,
    handler: function(range, context) {
      if (context.format.list !== "ordered") {
        this.quill.format("list", "ordered", true, Quill.sources.USER);
      } else {
        this.quill.format("list", false, Quill.sources.USER);
      }
    }
  },
  "custom-ul": {
    key: "8",
    shiftKey: true,
    shortKey: true,
    handler: function(range, context) {
      if (context.format.list !== "bullet") {
        this.quill.format("list", "bullet", true, Quill.sources.USER);
      } else {
        this.quill.format("list", false, Quill.sources.USER);
      }
    }
  }
};

var parentContainer = document.getElementById("parent-container");
var quillContainer = document.getElementById("quill-container");
var quill;

function test() {
  const maxSize = 500;
  const richText = "<p></p>";
  const enableProgressBar = false;
  const height = 500;
  const placeholder = false;
  window.isReadOnly = false;

  /* Initialize Quill and set allowed formats and toolbar */
  if (!quill) {
    var Block = Quill.import('blots/block');
    Block.tagName = 'div';
    Quill.register(Block);
    Quill.register(Quill.import('attributors/style/background'), true);
    Quill.register(Quill.import('attributors/style/color'), true);
    Quill.register(Quill.import("attributors/style/size"), true);
    Quill.register(Quill.import("attributors/style/align"), true);
    allowedFormats = availableFormatsFlattened;
    quill = new Quill(quillContainer, {
      formats: allowedFormats,
      modules: {
        toolbar: "#quill-toolbar",
        history: {
          delay: 500,
          maxStack: 500,
          userOnly: true
        },
        keyboard: {
          bindings: bindings
        }
      },
      placeholder: "",
      theme: "snow"
    });

    insertAccentColor("#FFF");

    /* Hide/show toolbar options based on if they are allowed formats */
    availableFormatsFlattened.forEach(function (format) {
      console.log(format);
      var nodeArray = Array.prototype.slice.call(document.querySelectorAll(buildCssSelector(format)));
      nodeArray.forEach(function (element) {
        console.log(element);
        element.style.display = allowedFormats.indexOf(format) >= 0 ? "block" : "none";
      });
    });

    /* Add spacing to the toolbar based on visibilities */
    availableFormats.forEach(function (formatList) {
      var cssSelectors = [];
      formatList.forEach(function (format) {
        if (allowedFormats.indexOf(format) >= 0) {
          cssSelectors.push(buildCssSelector(format));
        }
      });
      if (cssSelectors.length > 0) {
        var elementsOfFormatList = document.querySelectorAll(cssSelectors.join(","));
        var lastElementOfFormatList = elementsOfFormatList[elementsOfFormatList.length - 1];
        lastElementOfFormatList.classList.add("ql-spacer");
      }
    });

    /* Update tooltips for Mac vs. PC */
    var tooltipArray = Array.prototype.slice.call(document.querySelectorAll("[tooltip]"));
    tooltipArray.forEach(function (element) {
      element.setAttribute("tooltip", element.getAttribute("tooltip").replace("%", IS_MAC ? "Cmd" : "Ctrl"));
    });

    quill.on("text-change", debounce(function (delta, oldDelta, source) {
      if (source == "user") {
        window.isQuillActive = true;
        // validate(false);
        // updateValue();
      }
    }, 500)
    );

    /* only update when focus is lost (when relatedTarget == null) */
    quill.root.addEventListener("blur", function (focusEvent) {
      // See https://github.com/quilljs/quill/issues/1951#issuecomment-408990849
      if (focusEvent && !focusEvent.relatedTarget) {
        window.isQuillActive = false;
        // updateValue();
      }
    });

    /**
     * Step1. select local image
     *
     */
    function selectLocalImage() {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.click();

      // Listen upload local image and save to server
      input.onchange = () => {
        const file = input.files[0];

        // file type is only image.
        if (/^image\//.test(file.type)) {
          saveToServer(file);
        } else {
          console.warn('You could only upload images.');
        }
      };
    }

    /**
     * Step2. save to server
     *
     * @param {File} file
     */
    function saveToServer(file=File) {
      const fd = new FormData();
      fd.append('image', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://navlabsdev.appiancloud.com/suite/webapi/upload', true);
      xhr.setRequestHeader("Authorization", "Basic " + btoa("wes.jones:testtest"));
      xhr.setRequestHeader("Appian-Document-Name", "wells.png");
      xhr.onload = () => {
        if (xhr.status === 200) {
          // this is callback data: url
          // const url = JSON.parse(xhr.responseText).data;
          const url = xhr.responseText;
          console.log(url);
          insertToEditor(url);
        }
      };
      xhr.send(file);
    }

    /**
     * Step3. insert image url to rich editor.
     *
     * @param {string} url
     */
    function insertToEditor(url=string) {
      // push image url to rich editor.
      const range = quill.getSelection();
      quill.insertEmbed(range.index, 'image', `https://navlabsdev.appiancloud.com/suite/doc/${url}`);
    }

    // quill editor add image handler
    quill.getModule('toolbar').addHandler('image', () => {
      selectLocalImage();
    });


  }

  /* Update maxSize if specified */
  window.quillMaxSize = maxSize || MAX_SIZE_DEFAULT;

  /* Apply display settings */
  handleDisplay(enableProgressBar, height, placeholder);

  /* update value if user isn't currently editing */
  if (window.isQuillActive) {
    console.warn("Not updating contents because quill is active");
  } else {
    const contents = getContentsFromHTML(richText);
    quill.setContents(contents);
  }

  /* Check max size */
  // validate(false);
};

function updateValue() {
  if (validate(false)) {
    const contents = quill.getContents();
    /* Save value (Quill always adds single newline at end, so treat that as null) */
    if (quill.getText() === "\n") {
      Appian.Component.saveValue("richText", null);
    } else {
      const html = getHTMLFromContents(contents);
      Appian.Component.saveValue("richText", html);
    }
  }
}

/************ Utility Methods *************/
function insertAccentColor(color) {
  var styleEl = document.createElement("style");
  document.head.appendChild(styleEl);
  var styleSheet = styleEl.sheet;
  styleSheet.insertRule("h3" + "{" + "color: " + color + "}", styleSheet.cssRules.length);
}

function handleDisplay(enableProgressBar, height, placeholder) {
  quill.enable(!window.isReadOnly);
  /* Toolbar */
  var toolbar = document.querySelector(".ql-toolbar");
  toolbar.style.display = window.isReadOnly ? "none" : "block";
  /* Progress Bar */
  var progressBar = document.getElementById("sizeBar");
  var showProgressBar = enableProgressBar !== false && !window.isReadOnly;
  progressBar.style.display = showProgressBar ? "block" : "none";
  /* Height
     IE11 doesn't support flexbox so instead manually set heights and minHeights
     https://caniuse.com/#feat=flexbox
  */
  if (window.isReadOnly) {
    /* When readonly, don't specify any minHeight or height to limit height to match the content */
    quillContainer.style.height = "auto";
    parentContainer.style.height = "auto";
    quillContainer.style.minHeight = "";
    parentContainer.style.minHeight = "";
  } else if (height == "auto") {
    /* For "auto" height, start with a min height but allow to grow taller as content increases */
    quillContainer.style.height = "auto";
    parentContainer.style.height = "auto";
    /* Reserve ~60px for toolbar and progressBar. Reserve 45px for toolbar without progressBar */
    quillContainer.style.minHeight = showProgressBar ? "100px" : "115px";
    parentContainer.style.minHeight = "160px"; /* This is a randomly-selected, good looking default */
  } else {
    /* For designer-specified heights, force height to match exactly and not grow */
    quillContainer.style.minHeight = "";
    parentContainer.style.minHeight = "";
    var heightInt = parseInt(height);
    /* Reserve ~60px for toolbar and progressBar. Reserve 45px for toolbar without progressBar */
    quillContainer.style.height = heightInt - (showProgressBar ? 60 : 45) + "px";
    parentContainer.style.height = heightInt + "px";
  }
  /* Placeholder */
  quill.root.dataset.placeholder = placeholder && !window.isReadOnly ? placeholder : "";
}

function getContentsFromHTML(html) {
  /* Use a new, temporary Quill because update doesn't work if the current Quill is readonly */
  var tempQuill = new Quill(document.createElement("div"), { formats: allowedFormats });
  html = revertIndentInlineToClass(html);
  tempQuill.root.innerHTML = html;
  tempQuill.update();
  var richTextContents = tempQuill.getContents();
  return richTextContents;
}

// This function provides backwards compatibility from the inline indentation to the class indentation
// Previously, a single indentation was <p style="margin-left: 1em;">
// Now, a single indentation is <p class="ql-indent-1">
function revertIndentInlineToClass(html) {
  var indentRegex = /style="margin-left: ([0-9]+)em;"/gi;
  return html.replace(indentRegex, replaceIndentRegex);
  function replaceIndentRegex(match) {
    return match.replace('style="margin-left: ', 'class="ql-indent-').replace('em;"', '"');
  }
}

function getHTMLFromContents(contents) {
  var tempQuill = new Quill(document.createElement("div"));
  tempQuill.setContents(contents);
  return tempQuill.root.innerHTML;
}

/**
 * Enforce validations (currently just size validation)
 * @param {boolean} forceUpdate - If true, will execute setValidations() regardless of validation change (because of Appian caching of validations)
 * @return {boolean} Whether the component is valid
 */
function validate(forceUpdate) {
  const size = getSize();
  updateUsageBar(size);
  var newValidations = [];
  if (size > window.quillMaxSize && !window.isReadOnly) {
    newValidations.push("Content exceeds maximum allowed size");
  }
  if (forceUpdate || !(newValidations.toString() === window.currentValidations.toString())) {
    Appian.Component.setValidations(newValidations);
  }
  window.currentValidations = newValidations;
  return window.currentValidations.length === 0;
}

function getSize() {
  if (quill.getText() === "\n") {
    return 0;
  }
  const contents = quill.getContents();
  const html = getHTMLFromContents(contents);
  return html.length;
}

function updateUsageBar(size) {
  var usageBar = document.getElementById("usageBar");
  var usageMessage = document.getElementById("usageMessage");
  const usage = Math.round((100 * size) / window.quillMaxSize);
  const usagePercent = usage <= 100 ? usage + "%" : "100%";
  /* update usage message */
  const message = " " + usagePercent + " used";
  usageMessage.innerHTML = message;
  /* update usage bar width and color */
  usageBar.style.width = usagePercent;
  if (usage <= 75) {
    usageBar.style.backgroundColor = Appian.getAccentColor();
  } else if (usage <= 90) {
    usageBar.style.backgroundColor = "orange";
  } else {
    usageBar.style.backgroundColor = "red";
  }
}

function buildCssSelector(format) {
  return "button.ql-" + format + ",span.ql-" + format;
}

function debounce(func, delay) {
  var inDebounce;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(inDebounce);
    inDebounce = setTimeout(function() {
      func.apply(context, args);
    }, delay);
  };
}

/**
 * Enable copy/paste from clipboard for non-html images.
 * Reference: https://github.com/quilljs/quill/issues/137
 */
var IMAGE_MIME_REGEX = /^image\/(p?jpeg|gif|png)$/i;
var loadImage = function (file) {
    var reader = new FileReader();
    reader.onload = function(e){
        var img = document.createElement('img');
        img.src = e.target.result;
        var range = window.getSelection().getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
    };
    reader.readAsDataURL(file);
};

document.onpaste = function(e){
    var items = e.clipboardData.items;

    for (var i = 0; i < items.length; i++) {
        if (IMAGE_MIME_REGEX.test(items[i].type)) {
            loadImage(items[i].getAsFile());
            return;
        }
    }

    // Normal paste handling here
}

test();
