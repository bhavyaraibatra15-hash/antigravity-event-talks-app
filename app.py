import os
import urllib.request
import xml.etree.ElementTree as ET
import re
import html
import json
import time
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Cache file to store release notes locally
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache_releases.json')
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html(html_str):
    """Clean HTML tags and return plain text."""
    if not html_str:
        return ""
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', '', html_str)
    # Decode HTML entities
    text = html.unescape(text)
    # Normalize whitespaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_release_notes():
    """Fetch and parse release notes from the Google Cloud XML feed."""
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        all_updates = []
        
        for entry in root.findall('atom:entry', ns):
            title = entry.find('atom:title', ns).text  # Usually the date, e.g., "June 17, 2026"
            updated = entry.find('atom:updated', ns).text
            content_elem = entry.find('atom:content', ns)
            content_html = content_elem.text if content_elem is not None else ""
            
            link_elem = entry.find("atom:link[@rel='alternate']", ns)
            link = link_elem.get('href') if link_elem is not None else ""
            
            # Split the content by <h3> headers to get individual updates
            parts = re.split(r'<h3>(.*?)</h3>', content_html)
            
            if len(parts) == 1:
                # No <h3> tags, treat entire content as one update
                text = clean_html(content_html)
                if text:
                    all_updates.append({
                        'date': title,
                        'updated_iso': updated,
                        'link': link,
                        'category': 'General',
                        'content_html': content_html.strip(),
                        'content_text': text
                    })
            else:
                # Alternates: pre-h3 (empty/whitespace), category, content, category, content...
                for i in range(1, len(parts), 2):
                    category = parts[i].strip()
                    body = parts[i+1] if i+1 < len(parts) else ""
                    text = clean_html(body)
                    all_updates.append({
                        'date': title,
                        'updated_iso': updated,
                        'link': link,
                        'category': category,
                        'content_html': body.strip(),
                        'content_text': text
                    })
                    
        # Sort updates by date descending (using updated_iso)
        all_updates.sort(key=lambda x: x.get('updated_iso', ''), reverse=True)
        
        # Save to cache file with metadata
        cache_data = {
            'last_fetched': time.time(),
            'updates': all_updates
        }
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
        return all_updates, None
    except Exception as e:
        return None, str(e)

def get_release_notes(force_refresh=False):
    """Retrieve release notes from cache or fetch them if cache is missing or expired."""
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            # If cache is less than 30 minutes old, use it
            if time.time() - cache_data.get('last_fetched', 0) < 1800:
                return cache_data.get('updates', []), None
        except Exception:
            pass # Fallback to fetching if cache reading fails
            
    return parse_release_notes()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    updates, error = get_release_notes(force_refresh=force_refresh)
    
    if error:
        # If there's an error but we have cache, fall back to cache
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                return jsonify({
                    'updates': cache_data.get('updates', []),
                    'warning': f"Failed to fetch fresh data: {error}. Using cached data.",
                    'last_fetched': cache_data.get('last_fetched', 0)
                })
            except Exception:
                pass
        return jsonify({'error': error}), 500
        
    last_fetched = time.time()
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            last_fetched = cache_data.get('last_fetched', time.time())
        except Exception:
            pass
            
    return jsonify({
        'updates': updates,
        'last_fetched': last_fetched
    })

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
