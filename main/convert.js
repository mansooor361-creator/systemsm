'use strict';

const path = require('path');
const fs = require('fs');

async function convertToMarkdown(filePath, buffer) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.pdf') return pdfToMarkdown(buffer);
  if (ext === '.docx') return docxToMarkdown(buffer);
  if (ext === '.doc') throw new Error('DOC (legacy) is not supported — save as DOCX first');
  if (['.txt', '.md', '.markdown'].includes(ext)) return buffer.toString('utf8');
  if (['.html', '.htm'].includes(ext)) return htmlToMarkdown(buffer.toString('utf8'));
  throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
}

async function pdfToMarkdown(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return textToMarkdown(data.text);
}

async function docxToMarkdown(buffer) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.convertToHtml({ buffer });
  return htmlToMarkdown(value);
}

function htmlToMarkdown(html) {
  let md = html;
  md = md.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, l, t) => `\n${'#'.repeat(+l)} ${strip(t)}\n`);
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => `**${strip(c)}**`);
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => `*${strip(c)}*`);
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c) => `- ${strip(c)}\n`);
  md = md.replace(/<hr[^>]*>/gi, '\n---\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/(p|div|tr|table|h[1-6])>/gi, '\n');
  md = md.replace(/<[^>]+>/g, '');
  return textToMarkdown(md);
}

function textToMarkdown(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];

  const flush = () => { if (para.length) { out.push(para.join(' ') + '\n'); para = []; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }

    const heading = line.match(/^(المادة|Article)\s*\(?\s*([٠-٩0-9]+)\s*\)?\s*[:：\-–]?\s*(.*)$/);
    if (heading) {
      flush();
      out.push(`### ${heading[1]} ${heading[2]}${heading[3] ? ' — ' + heading[3] : ''}\n`);
      continue;
    }
    const chapter = line.match(/^(الباب|الفصل|Chapter|Section)\s+([^\s:：]+)\s*[:：\-–]?\s*(.*)$/);
    if (chapter) {
      flush();
      out.push(`## ${chapter[1]} ${chapter[2]}${chapter[3] ? ' — ' + chapter[3] : ''}\n`);
      continue;
    }
    if (line.length <= 60 && !/[.،؛]$/.test(line) && para.length === 0) {
      out.push(`**${line}**\n`);
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function strip(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { convertToMarkdown, textToMarkdown, htmlToMarkdown };
