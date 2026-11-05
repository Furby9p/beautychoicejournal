import {escapeHtml as e} from './content.mjs';
export function renderCitations(value,sourceCount){return e(value).replace(/\[(\d+)\]/g,(match,n)=>Number(n)>=1&&Number(n)<=sourceCount?`<a class="citation" href="#source-${n}" aria-label="查看来源 ${n}">[${n}]</a>`:match);}
export function renderTable(table,sourceCount){
 if(!Array.isArray(table.columns)||table.columns.length<2||!Array.isArray(table.rows)||table.rows.some(row=>!Array.isArray(row)||row.length!==table.columns.length))throw Error('决策表列数不一致');
 return `<div class="decision-table" tabindex="0" role="region" aria-label="${e(table.caption||'需求与选择对照')}"><table><caption>${e(table.caption||'需求与选择对照')}</caption><thead><tr>${table.columns.map(c=>`<th scope="col">${e(c)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${renderCitations(cell,sourceCount)}</th>`:`<td>${renderCitations(cell,sourceCount)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="table-hint">左右滑动查看完整对照 →</p>`;
}
export function renderSections(article){return article.sections.map((s,i)=>`<section id="section-${i}"><h2>${e(s.heading)}</h2>${s.paragraphs.map(p=>`<p>${renderCitations(p,article.sources.length)}</p>`).join('')}${s.table?renderTable(s.table,article.sources.length):''}</section>`).join('');}
