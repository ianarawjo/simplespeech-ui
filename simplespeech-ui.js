
/**
 * Simplespeech-UI
 * An implementation of SS's UI as a contenteditable div.
 * This is the 'View' in MVC paradigm.
 * @module simplespeech
 * @requires jQuery
 * @author ian
 * Created by ian on 03/01/2016.
 */
(function(simplespeech) {
    'use strict';

    simplespeech.editgraph = function() {

        var base = [];
        var g = [];
        var edittype = { NONE: 0, INS: 1, DEL: 2, REPL: 3 };
        var op = function(type, idx, uid, word) {
            this.type = type;
            this.idx = idx;
            this.uid = uid;
            this.word = word;
        };

        var onset = function(setops) {
            g = []; base = [];
            let i = 0;
            for (let s of setops) {
                base.push(new op(edittype.NONE, i, s[0], s[1]));
                i++;
            }
        };

        var oninsert = function(idx, uid, word) {
            if (idx > g.length || idx < 0) {
                console.log("Error @ oninsert: Invalid index: ", idx);
                return;
            }
            g.push(new op(edittype.INS, idx, uid, word));
            if (this.onchange) this.onchange();
        };
        var onremove = function(idx, uid, word) {
            if (idx >= g.length || idx < 0) {
                console.log("Error @ onremove: Invalid index: ", idx);
                return;
            }
            g.push(new op(edittype.DEL, idx, uid, word));
            if (this.onchange) this.onchange();
        };
        var onreplace = function(idx, uid, word) {
            if (idx >= g.length || idx < 0) {
                console.log("Error @ onreplace: Invalid index: ", idx);
                return;
            }
            g.push(new op(edittype.REPL, idx, uid, word));
            if (this.onchange) this.onchange();
        };

        return {
            listen: function(ssui) {
                ssui.oninsert = oninsert;
                ssui.onremove = onremove;
                ssui.onreplace = onreplace;
                ssui.onset = onset;
            },
            disconnect: function() {
                ssui.oninsert = null;
                ssui.onremove = null;
                ssui.onreplace = null;
                ssui.onset = null;
            },
            onchange: null,

            /**
             * Applies edit ops to array (talkens, timestamps, etc) where each obj must have .word attribute.
             * createFunc should be a function which takes the op and returns a new obj to add to ts.
             */
            apply: function(ts, createFunc) {

                for (let o in g) {
                    if (o.type === edittype.INS) {
                        ts.splice(o.idx, 0, createFunc(o));
                    }
                    else if (o.type === edittype.DEL) {
                        ts.splice(o.idx, 1);
                    }
                    else if (o.type === edittype.REPL) {
                        ts[idx].word = o.word;
                    }
                }

                return ts;
            }
        };
    };

    simplespeech.ui = function(__div) {
        var pub = {};

        // DOM elements
        var $textbox = $(__div);
        var $overlay;
        var $token, $snip;

        // Mutation observer
        var observer, config;

        // Listener callbacks
        /**
         * Fired when element is removed.
         * Function in form (index, uid, word).
         */
        pub.onremove = null;

        /**
         * Fired when element is inserted into the DOM.
         * Function in form (index, uid, word).
         */
        pub.oninsert = null;

        /**
         * Fired when element text is modified.
         * Function in form (index, uid, word).
         */
        pub.onreplace = null;

        /**
         * Fired when elements are first added (immediately after transcription).
         * Function in form ([uid, word]).
         */
        pub.onset = null;

        // Init
        var _init = function() {

            $overlay = generateOverlayDiv();
            console.log('Overlay div generated: ', $overlay[0]);
            console.log('Adding overlay div to textbox: ', $textbox[0]);
            $textbox.append($overlay);

            // Charwidth prototype
            $token = $(document.createElement('span'));
            $token.addClass('ssui-charwidth');
            $token.text('\xa0');

            // Ghosted text prototype
            $snip = $(document.createElement('span'));
            $snip.addClass('ssui-textwidth');
            /*$snip.attr('spellcheck', 'false');
            $snip.attr('autocomplete', 'off');
            $snip.attr('autocorrect', 'off');
            $snip.attr('autocapitalize', 'off');*/
            //var $txtspan = $(document.createElement('span'));
            //$txtspan.css('position', 'absolute');
            //$txtspan.css('z-index', 0);
            //$snip.append($txtspan);

            /*var $whiteout = $(document.createElement('div'));
            //$whiteout.css('position', 'absolute');
            $whiteout.css('display', 'inline-block');
            $whiteout.css('z-index', 1);
            $whiteout.css('width', '100%');
            $whiteout.css('height', '100%');
            $whiteout.css('background-color', 'white');
            $whiteout.css('opacity', 0.2);
            $whiteout.addClass('ssui-whiteout');
            $snip.append($whiteout);*/

            //pub.set('This is an automated voice system');

            // Setup event handlers
            $textbox[0].addEventListener('keydown', onkeydown);
            observer = new MutationObserver(onmutation);
            config = { attributes: true, childList: true, characterData: true, subtree:true };

        };

        pub.set = function(txt) {
            // Add words (set initial state)
            var wrds = txt.split(' '); var $t, $n, uid;
            var setops = [];
            wrds.forEach(function(word) {

                // Create unique id for text element
                uid = generateUID();

                // Create ghosted text span
                $t = generateSnip(uid, word);
                $overlay.append($t);

                //$t.children('div').css('width', $t.children('span').width());
                //$t.children('div').css('height', $t.children('span').height());

                // Created selectable span + set at width of text
                $n = generateSpan($t, uid, word);
                $textbox.append($n);

                $n.attr('idx', $textbox.children().index($n));
                console.log('index: ', $n.attr('idx'));

                setops.push([uid, word]);

            });

            if (pub.onset) pub.onset(setops);
        };

        pub.monitor = function() {
            observer.observe($textbox[0], config);
        };
        pub.stopMonitoring = function() {
            observer.disconnect();
        };

        // Events
        var onkeydown = function(e) {
            var allowed_keys = [8, 37, 38, 39, 40, 8];
            var allowed_keys_with_mod = [86, 88, 90, 67];
            if (e.keyCode === 32) { // SPACE

                var c = caret()+1;
                var $o = overlayAtIndex(c);
                if ($o.hasClass('pause')) {

                    console.log('extending space');

                    var added_space = $o.text() + '\xa0';
                    $o.text(added_space);
                    $o.attr('word', added_space);

                    var $s = spanAtIndex(c);
                    $s.css('letter-spacing', $o.width());
                    $s.attr('word', added_space);

                    pub.onreplace(c, uid, added_space);

                } else if (overlayAtIndex(c+1).length > 0 && overlayAtIndex(c+1).hasClass('pause')) {

                } else { // insert space

                    console.log('inserting space');

                    // We don't want the MutationObserver to respond to this change...
                    safeDOMChangeWrapper(function() {

                        var uid = generateUID();
                        var $space_overlay = generateSnip(uid, '\xa0');
                        $o.after($space_overlay);

                        var $space = generateSpan($space_overlay, uid, '\xa0');
                        spanAtIndex(c).after($space);

                        $space.css('letter-spacing', $space_overlay.width());

                        updateIdx();

                        pub.oninsert(c+1, uid, '\xa0');

                    });

                }

                e.preventDefault();

            } else if ($.inArray(e.keyCode, allowed_keys) > -1) {

            } else if ($.inArray(e.keyCode, allowed_keys_with_mod) > -1)  { // backspace / delete, x, z, c, v

            } else e.preventDefault();
        };

        var onmutation = function(mutations) {
            var addedNodes = [];

            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes') return;

                console.log(mutation);

                updateIdx();

                $(mutation.removedNodes).each(function(value, index) {
                    if(this.nodeType === 1 && $(this).hasClass('ssui-charwidth')) {
                        var uid = $(this).attr('uid');
                        $('#' + uid).remove();
                        console.log($(this).attr('idx'), this);

                        pub.onremove($(this).attr('idx'), uid, $(this).attr('word'));
                    }
                });

                // Sort any added nodes:
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {

                    var arr = nltoarr(mutation.addedNodes);
                    for(let a of arr) {
                        if ($(a).hasClass('ssui-charwidth'))
                            addedNodes.push(a);
                    }
                }
            });

            if (addedNodes.length > 0) {
                addedNodes.sort(function(a,b) {
                    console.log($(a).attr('idx'), $(b).attr('idx'));
                    return Number($(a).attr('idx')) - Number($(b).attr('idx'));
                });
                console.log('added ', addedNodes);
                var previdx = Number($(addedNodes[0]).attr('idx'));
                $(addedNodes).each(function(value, index) {
                    if(this.nodeType === 1) {
                        var $prevtxt = overlayAtIndex(previdx);
                        //var $prevtxt = $('#' + $(this).prev().attr('uid'));
                        console.log(value, previdx, $prevtxt[0]);
                        var uid = $(this).attr('uid');
                        var word = $(this).attr('word');
                        var $t = generateSnip(uid, word);
                        if (previdx === 1) {
                            var $next = overlayAtIndex(previdx+1);
                            if (!$next || $next.length === 0) $overlay.prepend($t);
                            else                              $t.insertBefore($next);
                        } else
                            $t.insertAfter($prevtxt);
                        console.log("Added: ", word, this);
                        previdx++;

                        pub.oninsert(previdx, uid, word);
                    }
                });
            }
        };

        // Utils
        function caret() {
            return getCaretOffset($textbox[0]); // no idea why its -67
        }
        function overlayAtIndex(c) {
            return $($overlay.children()[c-2]);
        }
        function spanAtIndex(c) {
            return $($textbox.children()[c-1]);
        }
        function updateIdx() {
            $textbox.children('span').each(function(value) {
                $(this).attr('idx', value+1);
            });
        }
        function safeDOMChangeWrapper(func) {
            observer.disconnect();
            func();
            observer.observe($textbox[0], config);
        }
        function nltoarr(nl) {
            var arr = [];
            for(var i = nl.length; i--; arr.unshift(nl[i]));
            return arr;
        }
        function generateUID() {
            return Math.round(new Date().getTime() + (Math.random() * 100));
        }
        function generateSnip(uid, word) {
            var $t = $snip.clone();
            $t.attr('id', uid);
            $t.text(word);
            if (word.indexOf('\xa0') === -1) $t.addClass('ssui-blue');
            else $t.addClass('pause');
            return $t;
        }
        function generateSpan($snip, uid, word) {
            var $n = $token.clone();
            $n.css('letter-spacing', $snip.width());
            $n.attr('uid', uid);
            $n.attr('word', word);
            return $n;
        }
        function generateOverlayDiv() {
            var $d = $(document.createElement('div'));
            $d.addClass('ssui-overlay');
            return $d;
        }

        _init();

        return pub;
    };

    /* Thanks to Tim Down @ SO
    http://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container/4812022#4812022 */
    function getCaretOffset(element) {
        var caretOffset = 0;
        var doc = element.ownerDocument || element.document;
        var win = doc.defaultView || doc.parentWindow;
        var sel;
        if (typeof win.getSelection != "undefined") {
            sel = win.getSelection();
            if (sel.rangeCount > 0) {
                var range = win.getSelection().getRangeAt(0);
                var preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(element);
                preCaretRange.setStart(preCaretRange.startContainer, 3);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                caretOffset = preCaretRange.toString().length;
            }
        } else if ( (sel = doc.selection) && sel.type != "Control") {
            var textRange = sel.createRange();
            var preCaretTextRange = doc.body.createTextRange();
            preCaretTextRange.moveToElementText(element);
            preCaretTextRange.setEndPoint("EndToEnd", textRange);
            caretOffset = preCaretTextRange.text.length;
        }
        return caretOffset;
    }

}(window.simplespeech = window.simplespeech || {}));
