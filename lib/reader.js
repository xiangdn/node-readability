// Copyright 2014 Tjatse
// https://github.com/Tjatse/read-art
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use strict";

var tagsToSkip = 'aside,footer,label,nav,noscript,script,link,meta,style,select,textarea,iframe', // no head
    embeds = 'embed,object',
    scoreKey = 'read-art-score',
    re_positive = /article|blog|body|content|entry|main|news|pag(?:e|ination)|post|story|text/i,
    re_negative = /com(?:bx|ment|-)|contact|comment|captcha|foot(?:er|note)?|link|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|util|shopping|tags|tool|widget|tip|dialog|copyright/i,
    re_unlikelyCandidates =  /ad-break|agegate|auth?or|bookmark|cat|com(?:bx|ment|munity)|date|disqus|extra|foot|header|ignore|link|menu|nav|pag(?:er|ination)|popup|related|remark|rss|share|shoutbox|sidebar|similar|social|sponsor|teaserlist|time|tweet|twitter/i,
    re_okMaybeItsACandidate = /and|article|body|column|main|column/i,
    re_divToPElements = /<(a|blockquote|dl|div|img|ol|p|pre|table|ul)/i,
    re_stopwords = /[\.。:：！;；]( |$)/,
    re_videos = /http:\/\/(?:www\.)?(?:youtube|vimeo|youku|tudou|56|letv|iqiyi)\.com/i,
    re_commas = /[,，.。;；?？、]/g;

// read article.
module.exports = function($, options){
  // 1st. node prepping, trash node that look cruddy, and
  //      turn divs into P's where they have been used in appropriately .
  var cans = getCandidates($, options);

  // 2nd. loop through all of the possible candidate nodes we found
  //      and find the one with the highest score.
  var topCandidate = getTopCandidate($, cans);

  // 3nd. grab article
  if(topCandidate && topCandidate.length > 0){
    return grabArticle($, topCandidate);
  }else{
    return null;
  }
}

/**
 * Get scored candidates from paragraphs.
 * @param $ dom
 * @param options options
 * @return {Array}
 */
function getCandidates($, options){
  // remove useless tags.
  $(tagsToSkip).remove();

  var cans = [];
  $('div,p', 'body').each(function(){
    var node = $(this);
    // make sure node exists.
    if(!node || node.length == 0){
      return;
    }
    // use blank to separate class and id to avoid incorrect operation, e.g.:
    // <div id="side" class="bar>...., the class_Id var will be sidebar, so, it make
    // this node match re_unlikelyCandidates, will be dropped, WTF...
    var classAndId = [node.attr('class') || '', node.attr('id') || ''].join(' ');
    if(classAndId.search(re_unlikelyCandidates) >= 0 && classAndId.search(re_okMaybeItsACandidate) < 0){
      node.remove();
      return;
    }

    var tagName = node.get(0).name.toLowerCase();

    // remove element that has no content.
    if(tagName === 'div' && node.contents().length < 1 && !node.text().trim()){
      node.remove();
      return;
    }

    // turn all divs that don't have children block level elements into p's
    if (tagName === "div") {
      // cache nodeHTML here.
      var nodeHTML;
      if ((nodeHTML = node.html()).search(re_divToPElements) < 0) {
        node.replaceWith('<p class="read-art-extra-bonus">' + nodeHTML + '</p>');
        nodeHTML = null;
      } else {
        node.contents().each(function(){
          var child = $(this);
          if(!child || child.length == 0){
            return;
          }
          // cache innerText here.
          var childDom = child.get(0), innerText;
          if(childDom.type == 'text' && (innerText = childDom.data.trim())){
            child.replaceWith('<p class="read-art-extra-bonus">' + innerText + '</p>');
            innerText = null;
          }
        });
      }
    }else if(tagName === 'p'){
      // loop through all P's, and assign a score to them.
      getNodeWeight(node, cans);
      return;
    }
  });
  // assign scores to `P`s that were turned from DIV by us.
  $('p.read-art-extra-bonus', 'body').each(function(){
    getNodeWeight($(this), cans);
  });
  return cans;
}

/**
 * Get the highest score candidate node.
 * @param $ dom
 * @param cans candidates
 * @return {*|jQuery|HTMLElement}
 */
function getTopCandidate($, cans){
  var topCandidate = null;
  cans.forEach(function(node){
    var score = node.data(scoreKey) || 0;
    score = score * (1 - getLinkDensity($, node));
    node.data(scoreKey, score);
    if(!topCandidate || score > topCandidate.data(scoreKey)){
      topCandidate = node;
    }
  });

  // if we still have not top candidate, just use the body as a last resort.
  return topCandidate || $('body');
}

/**
 * Grab article content from node.
 * @param topCandidate the node element.
 */
function grabArticle($, topCandidate){
  var article = $('<div id="read-art"></div>'),
    siblingScoreThreshold = Math.max(10, topCandidate.data(scoreKey) * 0.2),
    parent, siblings;
  if((parent = topCandidate.parent()) && parent.length > 0 && parent.get(0).name.toLowerCase() != 'body'){
    siblings = parent.children();
  }else{
    siblings = topCandidate.children();
  }
  siblings.each(function(){
    var node = $(this),
      tagName = node.get(0).name.toLowerCase(),
      append = false;
    
    if(node.is(topCandidate) || (node.data(scoreKey) || 0) > siblingScoreThreshold){
      append = true;
    }
    if(!append){
      var text = node.text().trim(),
        textLen = text.length;

      if(tagName == 'p'){
        var linkDensity = getLinkDensity($, node);

        if(textLen > 80 && linkDensity < 0.25){
          append = true;
        }else if((textLen < 80 && linkDensity == 0) || text.search(re_stopwords) !== -1){
          // end with .|。 commas must be a paragraph.
          append = true;
        }
      }else if((tagName == 'span' || tagName == 'font') && textLen > 0){
        append = true;
      }
    }
    if(append){
      node.removeAttr('style');
      article.append(node);
    }
  });
  return article;
}

/**
 * every node in candidates get a specified weight.
 * @param node the node element.
 * @param cans candidates array.
 */
function getNodeWeight(node, cans){
  // Add the score to the parent. The grandparent gets half
  var parent = node.parent();

  // if parent not exists, break.
  if (parent && parent.length == 0) {
    return;
  }

  var text = node.text().trim();

  // if this paragraph is less than 25 characters, don't even count it.
  if(text.length < 25){
    return;
  }

  var score = 1;

  // add points for any commas within this paragraph.
  var commas = text.match(re_commas);
  if (commas && commas.length) {
    score += commas.length;
  }
  // for every 100 characters in this paragraph, add another point. up to 3 points.
  score += Math.min(Math.floor(text.length / 100), 3);

  // add the score to the parent and the grandparent gets half.
  scoreNode(parent, score, cans);
  var grandParent = parent.parent();
  if (grandParent && grandParent.length > 0) {
    scoreNode(grandParent, score / 2, cans);
  }
}

/**
 * Add score to the node.
 * @param node the node element.
 * @param score score bonus.
 * @param cans candidates.
 */
function scoreNode(node, score, cans){
  if (!node.data(scoreKey)) {
    score += initNode(node);
    cans.push(node);
  } else {
    score += node.data(scoreKey);
  }
  node.data(scoreKey, score);
}

/**
 * Get a node's weight by regular expressions.
 * @param node the node element.
 * @return {Number}
 */
function getClassWeight(node) {
  var weight = 0;

  var classAndId = [node.attr('class') || '', node.attr('id') || ''].join(' ');
  if(classAndId.search(re_negative) >= 0){ weight -= 25; }
  if(classAndId.search(re_positive) >= 0){ weight += 25; }

  return weight;
}

/**
 * Get the density of links as a percentage of the content.
 * @param $ dom
 * @param node the node element.
 * @return {Number}
 */
function getLinkDensity($, node){
  var textLen = node.text().length;
  if(textLen == 0){
    return 0;
  }
  var linkLen = 0;
  node.find('a').each(function(){
    var anchor = $(this),
      href = anchor.attr('href');
    if(!href || href[0] === '#'){
      return;
    }
    linkLen += anchor.text().length;
  });
  return linkLen / textLen;
}

/**
 * initialize the node with different bonus.
 * @param node the node element.
 * @return {*}
 */
function initNode(node) {
  var score = 0;
  if (!node || node.length == 0) return score;

  switch (node.get(0).name.toLowerCase()) {
    case 'article':
      score = 20;
      break;
    case 'section':
      score = 15;
      break;
    case 'div':
      score = 5;
      break;

    case 'pre':
    case 'td':
    case 'blockquote':
      score = 3;
      break;

    case 'address':
    case 'ul':
    case 'ol':
    case 'li':
    case 'dl':
    case 'dd':
    case 'dt':
    case 'form':
      score = -3;
      break;

    case 'body':
    case 'th':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      score = -5;
      break;
  }

  return score + getClassWeight(node);
}