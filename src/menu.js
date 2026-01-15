// two menu implementations -- one native and one in html
D.installMenu = function Menu(mx) {
  if (D.el) {
    const pk = D.prf.keys();
    const k = {}; // k:a map of all keyboard shortcuts
    for (let i = 0; i < D.cmds.length; i++) {
      const [c,, d] = D.cmds[i];
      [k[c]] = (pk[c] || d);
    } // c:code, d:defaults
    const render = (x) => {
      let mi;
      if (x[''] === '-') return new D.el.MenuItem({ type: 'separator' });
      const h = {
        label: x[''],
        click: x.action,
        accelerator: x.cmd && k[x.cmd] ? k[x.cmd].replace(/-(.)/g, '+$1') : null,
      };
      if (x.group) {
        h.type = 'radio';
        h.checked = !!x.checked;
      } else if (x.checkBoxPref) {
        h.type = 'checkbox';
        h.checked = !!x.checkBoxPref();
        if (x.action) h.click = () => { x.action(mi.checked); };
        x.checkBoxPref((v) => { mi.checked = !!v; });
      }
      const roles = {
        cut: 0,
        copy: 0,
        paste: 0,
        togglefullscreen: 0,
        window: 0,
        help: 0,
        hide: 0,
        hideothers: 0,
        showall: 'unhide',
        minimize: 0,
        zoom: 0,
        front: 0,
        close: 0,
      };
      const r = x[''].replace(/[& ]/g, '').toLowerCase();
      if (r in roles) h.role = roles[r] || r;
      
      // Handle special macOS window actions
      if (x[''] === 'Move Window to Left of Screen') {
        h.click = () => {
          const win = D.el.BrowserWindow.getFocusedWindow();
          if (win) {
            const { screen } = D.el;
            const { x, y } = win.getBounds();
            const display = screen.getDisplayNearestPoint({ x, y });
            const { width, height } = display.workArea;
            win.setBounds({ x: display.workArea.x, y: display.workArea.y, width: Math.floor(width / 2), height });
          }
        };
      } else if (x[''] === 'Move Window to Right of Screen') {
        h.click = () => {
          const win = D.el.BrowserWindow.getFocusedWindow();
          if (win) {
            const { screen } = D.el;
            const { x, y } = win.getBounds();
            const display = screen.getDisplayNearestPoint({ x, y });
            const { width, height } = display.workArea;
            win.setBounds({ x: display.workArea.x + Math.floor(width / 2), y: display.workArea.y, width: Math.floor(width / 2), height });
          }
        };
      } else if (x[''] === 'Bring All to Front') {
        h.role = 'front';
      } else if (x[''] === 'Close Window') {
        h.role = 'close';
      }
      if (x.items) {
        h.submenu = new D.el.Menu();
        x.items.forEach((y) => { h.submenu.append(render(y)); });
      }
      mi = new D.el.MenuItem(h);
      return mi;
    };
    const m = new D.el.Menu();
    
    // Process menu items and inject window list into Window menu
    mx.forEach((y) => {
      const menuItem = render(y);
      
      // Set role for Window menu
      if (y[''] === 'Window') {
        menuItem.role = 'window';
      }
      
      // If this is the Window menu, inject the window list
      if (y[''] === 'Window' && y.items) {
        const submenu = menuItem.submenu;
        const windowManager = nodeRequire('./src/window-manager');
        
        // Find where to insert window list (after the separator after "Close All Windows")
        let insertIndex = -1;
        const items = submenu.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].label === 'Close All Windows') {
            // Find the next separator
            for (let j = i + 1; j < items.length; j++) {
              if (items[j].type === 'separator') {
                insertIndex = j + 1;
                break;
              }
            }
            break;
          }
        }
        
        // Build and insert window menu items
        const windowItems = windowManager.buildWindowMenuItems();
        if (windowItems.length > 0 && insertIndex >= 0) {
          // Add another separator before window list
          submenu.insert(insertIndex, new D.el.MenuItem({ type: 'separator' }));
          
          // Add all window items
          windowItems.forEach((item, idx) => {
            submenu.insert(insertIndex + 1 + idx, item);
          });
        }
      }
      
      m.append(menuItem);
    });
    
    if (D.mac) D.el.Menu.setApplicationMenu(m);
    else D.elw.setMenu(m);
  } else {
    const arg = mx;
    // DOM structure:
    // ┌.menu───────────────────────────────────────────┐
    // │┌div.m-sub────────────────────────────────┐     │
    // ││            ┌div.m-box──────────────────┐│     │
    // ││┌a.m-opener┐│┌a─────┐┌a─────┐┌div.m-sub┐││     │
    // │││┌span┐    │││┌span┐││┌span┐││         │││     │
    // ││││File│    ││││Open││││Save│││   ...   │││ ... │
    // │││└────┘    │││└────┘││└────┘││         │││     │
    // ││└──────────┘│└──────┘└──────┘└─────────┘││     │
    // ││            └───────────────────────────┘│     │
    // │└─────────────────────────────────────────┘     │
    // └────────────────────────────────────────────────┘
    // Top-level ".m-opener"-s also have class ".m-top"
    let $o; // original focused element
    let $m;
    const mFocus = (anchor) => {
      $m.find('.m-open').removeClass('m-open');
      if (!anchor) { $o && $o.focus(); $o = null; return; }
      $o || ($o = $(':focus'));
      const $a = $(anchor);
      $a.parentsUntil('.menu').addClass('m-open');
      $a.is('.m-top') ? $a.closest('.m-sub').find('a').eq(1).focus() : $a.focus();
    };
    const render = (x) => {
      if (!x) return null;
      if (x[''] === '-') return $('<hr>');
      let acc;
      const name = x[''].replace(/&(.)/g, (_, k) => {
        const r = acc || k === '&' ? k : `<u>${acc = k}</u>`;
        return r;
      }); // acc:access key
      const $a = $(`<a href=#><span>${name}</span></a>`);
      x.cmd && $a.append(`<span class=m-shc data-cmd=${x.cmd}>`);
      if (x.group) {
        $a.addClass(`m-group-${x.group}`)
          .toggleClass('m-checked', !!x.checked)
          .on('mousedown mouseup click', (e) => {
            const $e = $(e.currentTarget);
            $e.closest('.menu').find(`.m-group-${x.group}`).removeClass('m-checked');
            $e.addClass('m-checked');
            mFocus(null);
            x.action && x.action();
            return !1;
          });
      } else if (x.checkBoxPref) {
        x.checkBoxPref((v) => { $a.toggleClass('m-checked', !!v); });
        $a.toggleClass('m-checked', !!x.checkBoxPref())
          .on('mousedown mouseup click', (e) => {
            mFocus(null);
            x.action && x.action($(e.currentTarget).hasClass('m-checked'));
            return !1;
          });
      } else {
        x.action && $a.on('mousedown mouseup click', () => { mFocus(null); x.action(); return !1; });
      }
      if (!x.items) return $a;
      const $b = $('<div class=m-box>');
      return $('<div class=m-sub>')
        .append($a.addClass('m-opener'), $b.append(...x.items.map(render)));
    };
    const leftRight = (d, $e) => { // d: +1 or -1, $e: target element
      if (d > 0 && $e.is('.m-opener')) {
        mFocus($e.next('.m-box').find('a').first());
      } else if (d < 0 && !$e.is('.m-opener') && $e.parents('.m-sub').length > 1) {
        mFocus($e.closest('.m-sub').find('.m-opener').first());
      } else {
        const $t = $m.children();
        const n = $t.length;
        const i = $e.parentsUntil('.menu').last().index();
        mFocus($t.eq((i + d + n) % n).find('a').eq(1));
      }
      return !1;
    };
    const upDown = (d, $e) => { // d: +1 or -1, $e: target element
      if ($e.is('.m-top')) {
        mFocus($e.parent().find(':not(hr)').eq(1));
      } else {
        const $s = $e.closest('.m-box').children(':not(hr)');
        const i = $s.index($e);
        const n = $s.length;
        const $f = $s.eq((i + d + n) % n);
        mFocus($f.is('a') ? $f : $f.find('a').first());
      }
      return !1;
    };
    $m = $('div[class=menu]');
    $m.length || ($m = $('<div class=menu>').prependTo('body'));
    $m.empty()
      .addClass('menu')
      .append(arg.map(render));
    $m.find('>.m-sub>.m-opener').addClass('m-top');
    $m.on('mouseover', 'a', (e) => {
      const t = e.currentTarget;
      $(t).closest('.menu').children().is('.m-open') && mFocus(t);
    });
    $m.on('mousedown click', 'a', (e) => {
      const t = e.currentTarget;
      mFocus($(t).parentsUntil('.menu').last().is('.m-open') && e.type === 'mousedown' ? null : t);
      return !1;
    });
    $m.keydown((e) => {
      switch (e.key) {
        case 'ArrowLeft': leftRight(-1, $(e.target)); break;
        case 'ArrowRight': leftRight(1, $(e.target)); break;
        case 'ArrowUp': upDown(-1, $(e.target)); break;
        case 'ArrowDown': upDown(1, $(e.target)); break;
        case 'Escape': case 'F10': mFocus(null); return !1;
        default:
      }
      return !0;
    });
    $(document).mousedown((e) => { $(e.target).closest('.menu').length || mFocus(null); });
    const updShcs = (h) => {
      const k = {};
      for (let i = 0; i < D.cmds.length; i++) {
        const [c,, d] = D.cmds[i];
        [k[c]] = (h[c] || d);
      } // c:code, d:defaults
      $('.m-shc').each((e) => {
        const $e = $(e.currentTarget);
        $e.text(k[$e.data('cmd')] || '');
      });
    };
    updShcs(D.prf.keys()); D.prf.keys(updShcs);
  }
};
