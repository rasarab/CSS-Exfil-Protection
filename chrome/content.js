
function scan_css() 
{
	var sheets = document.styleSheets;
	var sheets_length = sheets.length;

    for (var i=0; i < sheets_length; i++) 
	{
	    var selectors   = [];
	    var selectorcss = [];
	    var rules       = getCSSRules(sheets[i]);

        if(rules == null)
        {
            // Retrieve and parse cross-domain stylesheet
            //console.log("Cross domain stylesheet: "+ sheets[i].href);
            incrementSanitize();
            getCrossDomainCSS(sheets[i]);
        }
        else
        {
            incrementSanitize();
            handleImportedCSS(rules);

            // Parse same-origin stylesheet
            //console.log("DOM stylesheet...");
            var _selectors = parseCSSRules(rules);
            filter_css(_selectors[0], _selectors[1]);

            if(checkCSSDisabled(sheets[i]))
            {
                enableCSS(sheets[i]);
            }

            decrementSanitize();
        }
	}
}



function handleImportedCSS(rules)
{
    // Scan for imported stylesheets
    for(var r=0; r < rules.length; r++)
    {
        if( Object.prototype.toString.call(rules[r]) == "[object CSSImportRule]")
        {
            // Adding new sheet to list
            incrementSanitize();

            // Found an imported CSS Stylesheet
            //console.log("Imported CSS...");

            var _rules = getCSSRules(rules[r].styleSheet);
            if(_rules == null)
            {
                // Parse imported cross domain sheet
                //console.log("Imported Cross Domain CSS...");
                getCrossDomainCSS(rules[r].styleSheet);
            }
            else
            {
                // Parse imported DOM sheet
                //console.log("Imported DOM CSS...");
                var _selectors = parseCSSRules(_rules);
                filter_css(_selectors[0], _selectors[1]);
                decrementSanitize();
            }
        }
        else
        {
            // imported rules must always come first so end the loop if we see a non-import rule
            r = rules.length;
        }
    }
}




function getCSSRules(_sheet)
{
    var rules = null;

	try 
	{
        //Loading CSS
	    //console.log("Loading CSS...");
	    rules = _sheet.rules || _sheet.cssRules;
	} 
	catch(e) 
	{
	    if(e.name !== "SecurityError") 
	    {
            //console.log("Error loading rules:");
            //console.log(e);
	        //throw e;
	    }
	}

    return rules;
}


function parseCSSRules(rules)
{
	var selectors   = [];
	var selectorcss = [];

    if(rules != null)
    {
        // Loop through all selectors and determine if any are looking for the value attribute and calling a remote URL
        for (r=0; r < rules.length; r++) 
        {
            var selectorText = null;
            if(rules[r].selectorText != null)
            {
                selectorText = rules[r].selectorText.toLowerCase();
            }

            var cssText = null;
            if(rules[r].cssText != null)
            {
                cssText = rules[r].cssText.toLowerCase();
            }

            if( 
                ( (selectorText != null) && (cssText != null) && 
                  (selectorText.indexOf('value') !== -1) && (selectorText.indexOf('=') !== -1) ) &&
                ( (cssText.indexOf('url') !== -1) && ( (cssText.indexOf('https://') !== -1) || (cssText.indexOf('http://') !== -1) ) )
              )
            {
                //console.log("CSS Exfil Protection blocked: "+ rules[r].selectorText);
                selectors.push(rules[r].selectorText);
                selectorcss.push(cssText);
            }

        }

    }

    // Check if any bad rules were found
    // if yes, temporarily disable stylesheet
    if (selectors[0] != null) 
    {
        //console.log("Found potentially malicious selectors!");
        if(rules[0] != null)
        {
            disableCSS(rules[0].parentStyleSheet);
        }
    }
    

    return [selectors,selectorcss];
}




function getCrossDomainCSS(orig_sheet)
{
	var rules;
    var url = orig_sheet.href;

    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() 
    {
        if (xhr.readyState == 4) 
        {
            // Create stylesheet from remote CSS
            var sheet = document.createElement('style');
            sheet.innerText = xhr.responseText;
            document.head.appendChild(sheet);
            
            var sheets = document.styleSheets;
            rules = getCSSRules(sheets[ sheets.length - 1]);

            handleImportedCSS(rules);

            var _selectors = parseCSSRules(rules);
            filter_css(_selectors[0], _selectors[1]);

            // Remove stylesheet
            sheet.disabled = true;
            sheet.parentNode.removeChild(sheet);

            
            if(checkCSSDisabled(orig_sheet))
            {
                enableCSS(orig_sheet);
            }

            decrementSanitize();
            
            return rules;
        }
    }
    xhr.send();
}



function filter_css(selectors, selectorcss)
{
    // Loop through found selectors and modify CSS if necessary
    for(s in selectors)
    {
        if( selectorcss[s].indexOf('background') )
        {
            filter_sheet.sheet.insertRule( selectors[s] +" { background-image:none !important; }", filter_sheet.sheet.cssRules.length);
        }
        else if( selectorcss[s].indexOf('list-style') )
        {
            filter_sheet.sheet.insertRule( selectors[s] +" { list-style: inherit !important; }", filter_sheet.sheet.cssRules.length);
        }
        else if( selectorcss[s].indexOf('cursor') )
        {
            filter_sheet.sheet.insertRule( selectors[s] +" { cursor: auto !important; }", filter_sheet.sheet.cssRules.length);
        }

        console.log("CSS Exfil Protection blocked: "+ selectors[s]);
    }
}



function disableCSS(_sheet)
{
    //console.log("Disabled CSS: "+ _sheet.href);
    _sheet.disabled = true;
}
function enableCSS(_sheet)
{
    //console.log("Enabled CSS: "+ _sheet.href);
    _sheet.disabled = false;
    
    // Some sites like news.google.com require a resize event to properly render all elements after re-enabling CSS
    window.dispatchEvent(new Event('resize'));
}
function checkCSSDisabled(_sheet)
{
    return _sheet.disabled;
}
function disableAndRemoveCSS(_sheet)
{
    _sheet.disabled = true;
    _sheet.parentNode.removeChild(_sheet);
}


function incrementSanitize()
{
    sanitize_inc++;
    //console.log("Increment: "+ sanitize_inc);
}
function decrementSanitize()
{
    sanitize_inc--;
    if(sanitize_inc <= 0)
    {
        disableAndRemoveCSS(css_load_blocker);
    }
    //console.log("Decrement: "+ sanitize_inc);
}

function buildContentLoadBlockerCSS()
{
    var csstext = "input,input ~ * { background-image:none !important; list-style: inherit !important; cursor: auto !important;}";
    return csstext;
}



/*
 *  Initialize
 */

var filter_sheet      = null;   // Create stylesheet which will contain our override styles
var css_load_blocker  = null;   // Temporary stylesheet to prevent early loading of resources we may block
var sanitize_inc      = 0;      // Incrementer to keep track when it's safe to unload css_load_blocker


// Run as soon as the DOM has been loaded
window.addEventListener("DOMContentLoaded", function() {

    // Create temporary stylesheet that will block early loading of resources we may want to block
    css_load_blocker  = document.createElement('style');
    css_load_blocker.innerText = buildContentLoadBlockerCSS();
    css_load_blocker.className = "__tmp_css_exfil_protection_load_blocker";
    document.head.appendChild(css_load_blocker);


    chrome.storage.local.get({
        enable_plugin: 1
    }, function(items) {

	    if(items.enable_plugin == 1)
        {
            // Create stylesheet that will contain our filtering CSS (if any is necessary)
            filter_sheet = document.createElement('style');
            filter_sheet.className = "__css_exfil_protection_filtered_styles";
            filter_sheet.innerText = "";
            document.head.appendChild(filter_sheet);

            // Increment once before we scan, just in case decrement is called too quickly
            incrementSanitize();

            scan_css();
        }
        else
	    {
            //console.log("Disabling CSS Exfil Protection");
            css_load_blocker.disabled = true;
	    }
    });


}, false);



window.addEventListener("load", function() {

    chrome.storage.local.get({
        enable_plugin: 1
    }, function(items) {

	    if(items.enable_plugin == 1)
        {
            // Unload increment called before scan
            decrementSanitize();
        }
    });

}, false);


