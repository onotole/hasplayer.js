/*
 * The copyright in this software is being made available under the BSD License, included below. This software may be subject to other third party and contributor rights, including patent rights, and no such rights are granted under this license.
 * 
 * Copyright (c) 2013, Digital Primates
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * •  Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * •  Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * •  Neither the name of the Digital Primates nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
Dash.dependencies.DashParser = function () {
    "use strict";

    var SECONDS_IN_YEAR = 365 * 24 * 60 * 60,
        SECONDS_IN_MONTH = 30 * 24 * 60 * 60, // not precise!
        SECONDS_IN_DAY = 24 * 60 * 60,
        SECONDS_IN_HOUR = 60 * 60,
        SECONDS_IN_MIN = 60,
        MINUTES_IN_HOUR = 60,
        MILLISECONDS_IN_SECONDS = 1000,
        durationRegex = /^P(([\d.]*)Y)?(([\d.]*)M)?(([\d.]*)D)?T?(([\d.]*)H)?(([\d.]*)M)?(([\d.]*)S)?/,
        datetimeRegex = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]*)(\.[0-9]*)?)?(?:([+-])([0-9]{2})([0-9]{2}))?/,
        xmlDoc = null,

        parseDuration = function(str) {
            //str = "P10Y10M10DT10H10M10.1S";
            var match = durationRegex.exec(str);
            return (parseFloat(match[2] || 0) * SECONDS_IN_YEAR +
                    parseFloat(match[4] || 0) * SECONDS_IN_MONTH +
                    parseFloat(match[6] || 0) * SECONDS_IN_DAY +
                    parseFloat(match[8] || 0) * SECONDS_IN_HOUR +
                    parseFloat(match[10] || 0) * SECONDS_IN_MIN +
                    parseFloat(match[12] || 0));
        },

        parseDateTime = function(str) {
            var match = datetimeRegex.exec(str),
                utcDate;
            // If the string does not contain a timezone offset different browsers can interpret it either
            // as UTC or as a local time so we have to parse the string manually to normalize the given date value for
            // all browsers
            utcDate = Date.UTC(
                parseInt(match[1], 10),
                parseInt(match[2], 10)-1, // months start from zero
                parseInt(match[3], 10),
                parseInt(match[4], 10),
                parseInt(match[5], 10),
                (match[6] && parseInt(match[6], 10) || 0),
                (match[7] && parseFloat(match[7]) * MILLISECONDS_IN_SECONDS) || 0);
            // If the date has timezone offset take it into account as well
            if (match[9] && match[10]) {
                var timezoneOffset = parseInt(match[9], 10) * MINUTES_IN_HOUR + parseInt(match[10], 10);
                utcDate += (match[8] === '+' ? -1 : +1) * timezoneOffset * SECONDS_IN_MIN * MILLISECONDS_IN_SECONDS;
            }

            return new Date(utcDate);
        },

        setAttributeIfExists = function(node, obj, key, conv) {
            var val = node.getAttribute(key);
            if (val !== null)
                obj[key] = conv ? conv(val) : val;
        },

        parseBaseURL = function(node) {
            return node.textContent;
        },

        parseInbandEventStream = function(node) {
            var inband = {};
            setAttributeIfExists(node, inband, "schemeIdUri");
            setAttributeIfExists(node, inband, "value", parseFloat);
            return inband;
        },

        parseSegment = function(node) {
            var segment = {};
            setAttributeIfExists(node, segment, "d", parseFloat);
            setAttributeIfExists(node, segment, "r", parseFloat);
            setAttributeIfExists(node, segment, "t", parseFloat);
            return segment;
        },

        parseSegmentTimeline = function(node) {
            var timeline = {};
            timeline.S = [];
            for (var c = 0; c < node.childNodes.length; ++c) {
                var child = node.childNodes[c];
                if (child.tagName === "S")
                    timeline.S.push(parseSegment(child));
            }
            timeline.S_asArray = timeline.S;
            return timeline;
        },

        parseSegmentTemplate = function(node) {
            var template = {};
            setAttributeIfExists(node, template, "initialization");
            setAttributeIfExists(node, template, "media");
            // setAttributeIfExists(node, template, "presentationTimeOffset", parseFloat);
            setAttributeIfExists(node, template, "timescale", parseFloat);
            setAttributeIfExists(node, template, "duration", parseFloat);
            setAttributeIfExists(node, template, "startNumber", parseFloat);
            for (var c = 0; c < node.childNodes.length; ++c) {
                var child = node.childNodes[c];
                if (child.tagName === "SegmentTimeline")
                    template.SegmentTimeline = parseSegmentTimeline(child);
            }
            template.SegmentTimeline_asArray = [template.SegmentTimeline];
            return template;
        },

        parseInitialization = function(node) {
            var init = {};
            setAttributeIfExists(node, init, "range");
            return init;
        },

        parseSegmentBase = function(node) {
            var base = {};
            setAttributeIfExists(node, base, "indexRange");
            for (var c = 0; c < node.childNodes.length; ++c) {
                var child = node.childNodes[c];
                if (child.tagName === "Initialization") {
                    base.Initialization = parseInitialization(child);
                    base.Initialization_asArray = [base.Initialization];
                }
            }
            return base;
        },

        parseRepresentation = function(node, mimeType, baseUrl, profiles, codecs) {
            var representation = {};
            setAttributeIfExists(node, representation, "bandwidth", parseFloat);
            setAttributeIfExists(node, representation, "codecs");
            setAttributeIfExists(node, representation, "width", parseFloat);
            setAttributeIfExists(node, representation, "height", parseFloat);
            setAttributeIfExists(node, representation, "id");
            setAttributeIfExists(node, representation, "mimeType");
            setAttributeIfExists(node, representation, "BaseURL");
            for (var c = 0; c < node.childNodes.length; ++c) {
                var child = node.childNodes[c];
                switch (child.tagName) {
                    case "BaseURL":
                        representation.BaseURL = parseBaseURL(child);
                        break;
                    case "SegmentBase":
                        representation.SegmentBase = parseSegmentBase(child);
                        representation.SegmentBase_asArray = [representation.SegmentBase];
                        break;
                }
            }
            representation.BaseURL = baseUrl + (representation.BaseURL ? representation.BaseURL : "");
            if (!representation.hasOwnProperty("mimeType"))
                representation.mimeType = mimeType;
            setAttributeIfExists(node, representation, "profiles");
            if (!representation.hasOwnProperty("profiles"))
                representation.profiles = profiles;
            setAttributeIfExists(node, representation, "codec");
            if (!representation.hasOwnProperty("codecs"))
                representation.codecs = codecs;
            return representation;
        },

        parseGenericObject = function(node) {
            var generic = {};
            var names = node.nodeName.split(":", 2);
            if (names.length > 1) {
                generic.__prefix = names[0];
                generic.__name = names[1];
            } else
                generic.__name = names[0];
            generic.__text = node.textContent;
            for (var a = 0; a < node.attributes.length; ++a)
                generic[node.attributes[a].name] = node.attributes[a].value;
            return generic;
        },

        parseContentProtection = function(node) {
            var protection = {};
            setAttributeIfExists(node, protection, "cenc:default_KID");
            setAttributeIfExists(node, protection, "schemeIdUri");
            setAttributeIfExists(node, protection, "value");
            for (var c = 0; c < node.childNodes.length; ++c) {
                var child = node.childNodes[c];
                var parsed = parseGenericObject(child);
                protection[parsed.__name] = parsed;
                protection[parsed.__name + "_asArray"] = [protection[parsed.__name]];
            }
            return protection;
        },

        parseAdaptationSet = function(node, baseUrl) {
            var adaptation = {};
            setAttributeIfExists(node, adaptation, "bitstreamSwitching");
            setAttributeIfExists(node, adaptation, "codecs");
            setAttributeIfExists(node, adaptation, "contentType");
            setAttributeIfExists(node, adaptation, "group", parseFloat);
            setAttributeIfExists(node, adaptation, "id", parseFloat);
            setAttributeIfExists(node, adaptation, "maxHeight", parseFloat);
            setAttributeIfExists(node, adaptation, "maxWidth", parseFloat);
            setAttributeIfExists(node, adaptation, "mimeType");
            setAttributeIfExists(node, adaptation, "profiles");
            setAttributeIfExists(node, adaptation, "segmentAlignment");
            setAttributeIfExists(node, adaptation, "startWithSAP", parseFloat);
            setAttributeIfExists(node, adaptation, "BaseURL");
            var c, child;
            for (c = 0; c < node.childNodes.length; ++c) {
                child = node.childNodes[c];
                if (child.tagName === "BaseURL")
                    adaptation.BaseURL = parseBaseURL(child);
            }
            adaptation.BaseURL = baseUrl + (adaptation.BaseURL ? adaptation.BaseURL : "");

            adaptation.Representation = [];
            adaptation.ContentProtection = [];
            for (c = 0; c < node.childNodes.length; ++c) {
                child = node.childNodes[c];
                switch (child.tagName) {
                    case "ContentProtection":
                        adaptation.ContentProtection.push(parseContentProtection(child));
                        break;
                    case "InbandEventStream":
                        adaptation.InbandEventStream = parseInbandEventStream(child);
                        adaptation.InbandEventStream_asArray = [adaptation.InbandEventStream];
                        break;
                    case "SegmentTemplate":
                        adaptation.SegmentTemplate = parseSegmentTemplate(child);
                        adaptation.SegmentTemplate_asArray = [adaptation.SegmentTemplate];
                        break;
                    case "Representation":
                        adaptation.Representation.push
                                (parseRepresentation(child, adaptation.mimeType, adaptation.BaseURL,
                                                     adaptation.profiles, adaptation.codecs));
                        break;
                }
            }
            adaptation.ContentProtection_asArray = adaptation.ContentProtection;
            adaptation.Representation_asArray = adaptation.Representation;
            if (adaptation.SegmentTemplate) {
                for (var r = 0; r < adaptation.Representation.length; ++r)
                    adaptation.Representation[r].SegmentTemplate = adaptation.SegmentTemplate;
            }
            return adaptation;
        },

        parsePeriod = function(node, baseUrl) {
            var period = {};
            setAttributeIfExists(node, period, "start", parseDuration);
            setAttributeIfExists(node, period, "BaseURL");
            var c, child;
            for (c = 0; c < node.childNodes.length; ++c) {
                child = node.childNodes[c];
                if (child.tagName === "BaseURL")
                    period.BaseURL = parseBaseURL(child);
            }
            period.BaseURL = baseUrl + (period.BaseURL ? period.BaseURL : "");
            period.AdaptationSet = [];
            for (c = 0; c < node.childNodes.length; ++c) {
                child = node.childNodes[c];
                if (child.tagName === "AdaptationSet")
                    period.AdaptationSet.push(parseAdaptationSet(child, period.BaseURL));
            }
            period.AdaptationSet_asArray = period.AdaptationSet;
            return period;
        },

        processManifest = function(baseUrl) {
            var mpd = {},
                mpdNode = xmlDoc.getElementsByTagName("MPD")[0];
            mpd.BaseURL = baseUrl;
            setAttributeIfExists(mpdNode, mpd, "xmlns");
            setAttributeIfExists(mpdNode, mpd, "xmlns:xsi");
            setAttributeIfExists(mpdNode, mpd, "xmlns:cenc");
            setAttributeIfExists(mpdNode, mpd, "xmlns:mspr");
            setAttributeIfExists(mpdNode, mpd, "xmlns:ms");
            setAttributeIfExists(mpdNode, mpd, "profiles");
            setAttributeIfExists(mpdNode, mpd, "type");
            setAttributeIfExists(mpdNode, mpd, "minBufferTime", parseDuration);
            setAttributeIfExists(mpdNode, mpd, "minimumUpdatePeriod", parseDuration);
            setAttributeIfExists(mpdNode, mpd, "timeShiftBufferDepth", parseDuration);
            setAttributeIfExists(mpdNode, mpd, "mediaPresentationDuration", parseDuration);
            setAttributeIfExists(mpdNode, mpd, "availabilityStartTime", parseDateTime);
            setAttributeIfExists(mpdNode, mpd, "publishTime", parseDateTime);
            setAttributeIfExists(mpdNode, mpd, "BaseURL");
            // First loop to update propagatable attributes (BaseURL)
            var c, child;
            for (c = 0; c < mpdNode.childNodes.length; ++c) {
                child = mpdNode.childNodes[c];
                if (child.tagName === "BaseURL")
                    mpd.BaseURL = parseBaseURL(child);
            }
            for (c = 0; c < mpdNode.childNodes.length; ++c) {
                child = mpdNode.childNodes[c];
                if (child.tagName === "Period") {
                    mpd.Period = parsePeriod(child, mpd.BaseURL);
                    break;
                }
            }
            mpd.Period_asArray = [mpd.Period];
            return mpd;
        },

        internalParse = function (data, baseUrl) {
            var manifest,
                start = new Date(),
                xml = null,
                process = null;

            try {
                xmlDoc = new DOMParser().parseFromString(data, "text/xml");
                xml = new Date();

                manifest = processManifest(baseUrl);
                process = new Date();

                this.debug.log("Parsing complete: (xml: " + (xml.getTime() - start.getTime()) +
                               "ms, process: " + (process.getTime() - xml.getTime()) +
                               "ms, total: " + ((process.getTime() - start.getTime()) / 1000) + "s)");
 
            } catch (e) {
                return Q.reject(null);
            }

            return Q.when(manifest);
        };

    return {
        debug: undefined,
        parse: internalParse
    };
};

Dash.dependencies.DashParser.prototype = {
    constructor: Dash.dependencies.DashParser
};
