# Bluebird's Windows accessibility helper (UI Automation).
#
# A long-running process: Bluebird writes one JSON request per line on stdin and reads one JSON answer per
# line on stdout. It keeps the live automation elements from the last outline in a table, so a numbered
# mark points at exactly that element until the next outline replaces the table. Needs Windows PowerShell
# 5.1 or later (included with Windows); no install.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class BbNative {
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] public struct INPUT {
        [FieldOffset(0)] public uint type;
        [FieldOffset(8)] public MOUSEINPUT mi;
        [FieldOffset(8)] public KEYBDINPUT ki;
    }
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    public static void Key(ushort vk, ushort scan, bool up, bool unicode) {
        INPUT[] i = new INPUT[1];
        i[0].type = 1;
        i[0].ki.wVk = vk;
        i[0].ki.wScan = scan;
        i[0].ki.dwFlags = (up ? 0x0002u : 0u) | (unicode ? 0x0004u : 0u);
        SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
    }
    public static void Mouse(uint flags, int data) {
        INPUT[] i = new INPUT[1];
        i[0].type = 0;
        i[0].mi.dwFlags = flags;
        i[0].mi.mouseData = (uint)data;
        SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@
[void][BbNative]::SetProcessDPIAware()

$AE = [System.Windows.Automation.AutomationElement]
$Walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$script:table = @{}
$script:generation = 0

function Reply($id, $ok, $body) {
    $out = @{ ok = $ok }
    if ($null -ne $id) { $out.id = $id }
    foreach ($k in $body.Keys) { $out[$k] = $body[$k] }
    [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 8))
    [Console]::Out.Flush()
}

function Fail($code, $message) {
    throw [System.Exception]::new("$code|$message")
}

function Clip($text, $length) {
    $flat = ([string]$text -replace '\s+', ' ').Trim()
    if ($flat.Length -gt $length) { return $flat.Substring(0, $length - 1) + '…' }
    return $flat
}

# --- applications and windows ------------------------------------------------------------------

function Get-Apps {
    $fg = [BbNative]::GetForegroundWindow()
    $fgPid = [uint32]0
    [void][BbNative]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object {
        @{ name = $_.ProcessName; bundle = $_.MainWindowTitle; pid = $_.Id; frontmost = ($_.Id -eq $fgPid); hidden = $false }
    }
}

function Find-App($query) {
    $apps = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
    $q = ([string]$query).ToLower()
    $asPid = 0
    if ([int]::TryParse($q, [ref]$asPid)) {
        $hit = $apps | Where-Object { $_.Id -eq $asPid } | Select-Object -First 1
        if ($hit) { return $hit }
    }
    $exact = @($apps | Where-Object { $_.ProcessName.ToLower() -eq $q -or $_.MainWindowTitle.ToLower() -eq $q })
    if ($exact.Count -ge 1) { return $exact[0] }
    $partial = @($apps | Where-Object { $_.ProcessName.ToLower().Contains($q) -or $_.MainWindowTitle.ToLower().Contains($q) })
    if ($partial.Count -eq 1) { return $partial[0] }
    if ($partial.Count -gt 1) {
        Fail 'ambiguous_app' ("`"$query`" matches several apps: " + (($partial | ForEach-Object { $_.ProcessName }) -join ', ') + '. Use the exact name.')
    }
    Fail 'no_app' "No running app matches `"$query`". Use desktop_open to launch it."
}

function Get-Windows($proc) {
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
    $found = $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
    $list = @()
    foreach ($w in $found) { $list += $w }
    return $list
}

# --- outline -------------------------------------------------------------------------------------

$Actionable = @('Button', 'CheckBox', 'RadioButton', 'ComboBox', 'Edit', 'Hyperlink', 'MenuItem', 'TabItem', 'ListItem', 'TreeItem', 'Slider', 'Spinner', 'SplitButton', 'DataItem')

function Friendly($type) {
    switch ($type) {
        'Edit' { 'textfield' } 'ComboBox' { 'combobox' } 'CheckBox' { 'checkbox' } 'RadioButton' { 'radio' }
        'Hyperlink' { 'link' } 'MenuItem' { 'menuitem' } 'TabItem' { 'tab' } 'ListItem' { 'listitem' } 'TreeItem' { 'treeitem' }
        'SplitButton' { 'button' } 'DataItem' { 'row' } 'Text' { 'text' } 'Window' { 'window' } 'Document' { 'document' }
        default { $type.ToLower() }
    }
}

function Get-TypeName($el) { $el.Current.ControlType.ProgrammaticName -replace '^ControlType\.', '' }

function Get-ElementValue($el) {
    try {
        if ($el.Current.IsPassword) { return $null }
        $p = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { return $p.Current.Value }
    } catch { }
    return $null
}

function Build-Outline($root, $procId, $startMark, $maxNodes, $maxDepth, $actionsOnly) {
    $lines = New-Object System.Collections.Generic.List[string]
    $state = @{ visited = 0; truncated = $false; mark = $startMark }

    function Visit($el, $depth) {
        if ($state.truncated) { return }
        if ($state.visited -ge $maxNodes) { $state.truncated = $true; return }
        $state.visited++
        try {
            $cur = $el.Current
            if ($cur.IsOffscreen -and $depth -gt 0) { return }
            $type = Get-TypeName $el
            $name = [string]$cur.Name
        } catch { return }
        $indent = '  ' * $depth
        $nextDepth = $depth
        if ($Actionable -contains $type) {
            $value = Get-ElementValue $el
            $label = $name
            if (-not $label -and $cur.AutomationId) { $label = $cur.AutomationId }
            $mark = $state.mark
            $script:table[$mark] = @{ el = $el; type = $type; name = $label; pid = $procId }
            $line = "$indent[$mark] $(Friendly $type)"
            if ($label) { $line += " `"$(Clip $label 90)`"" }
            if ($value -and $value -ne $label) { $line += " = `"$(Clip $value 70)`"" }
            if ($cur.IsPassword) { $line += ' (secure)' }
            $flags = @()
            try {
                $tp = $null
                if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$tp)) {
                    if ($tp.Current.ToggleState -eq 'On') { $flags += 'checked' }
                }
                $sp = $null
                if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$sp)) {
                    if ($sp.Current.IsSelected) { $flags += 'selected' }
                }
                $ep = $null
                if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$ep)) {
                    if ($ep.Current.ExpandCollapseState -eq 'Expanded') { $flags += 'expanded' } elseif ($ep.Current.ExpandCollapseState -eq 'Collapsed') { $flags += 'collapsed' }
                }
            } catch { }
            if (-not $cur.IsEnabled) { $flags += 'disabled' }
            if ($cur.HasKeyboardFocus) { $flags += 'focused' }
            if ($flags.Count -gt 0) { $line += " ($($flags -join ', '))" }
            $lines.Add($line)
            $state.mark = $mark + 1
            $nextDepth = $depth + 1
        } elseif ($type -eq 'Text') {
            if ($name -and -not $actionsOnly) { $lines.Add("$indent$(Clip $name 200)") }
            return
        } elseif ($type -in @('Window', 'Menu', 'MenuBar', 'ToolBar', 'Table', 'List', 'Tree', 'Tab', 'Document', 'Pane') -and ($name -or $type -eq 'Window')) {
            if (-not $actionsOnly -or $type -eq 'Window') {
                $lines.Add("$indent$(Friendly $type) `"$(Clip $name 70)`"")
                $nextDepth = $depth + 1
            }
        }
        if ($depth -ge $maxDepth) { return }
        try {
            $child = $Walker.GetFirstChild($el)
            while ($null -ne $child) {
                Visit $child $nextDepth
                $child = $Walker.GetNextSibling($child)
            }
        } catch { }
    }

    Visit $root 0
    if ($state.truncated) { $lines.Add('[…outline cut here; use desktop_look with a mark or a window to look inside one part]') }
    return @{ lines = $lines; truncated = $state.truncated }
}

function Get-Held($mark) {
    $m = 0
    if (-not [int]::TryParse([string]$mark, [ref]$m) -or -not $script:table.ContainsKey($m)) {
        Fail 'no_mark' "There is no mark $mark. Use desktop_look to see the current marks."
    }
    $item = $script:table[$m]
    try {
        $type = Get-TypeName $item.el
        if ($type -ne $item.type) { throw 'changed' }
    } catch {
        Fail 'stale_mark' 'That mark is out of date: the window changed. Use desktop_look again.'
    }
    return $item
}

# --- input -----------------------------------------------------------------------------------------

function Center($el) {
    $r = $el.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Width -le 0 -or $r.Height -le 0) { return $null }
    return @{ x = [int]($r.X + $r.Width / 2); y = [int]($r.Y + $r.Height / 2) }
}

function Click-At($x, $y, $right, $count) {
    [void][BbNative]::SetCursorPos($x, $y)
    $down = if ($right) { 0x0008 } else { 0x0002 }
    $up = if ($right) { 0x0010 } else { 0x0004 }
    for ($n = 0; $n -lt $count; $n++) {
        [BbNative]::Mouse($down, 0)
        [BbNative]::Mouse($up, 0)
    }
}

function Focus-Window($proc) {
    [void][BbNative]::ShowWindow($proc.MainWindowHandle, 9)
    [void][BbNative]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 150
}

$VK = @{
    'enter' = 0x0D; 'return' = 0x0D; 'tab' = 0x09; 'escape' = 0x1B; 'esc' = 0x1B; 'space' = 0x20; 'backspace' = 0x08; 'delete' = 0x2E
    'left' = 0x25; 'up' = 0x26; 'right' = 0x27; 'down' = 0x28; 'home' = 0x24; 'end' = 0x23; 'pageup' = 0x21; 'pagedown' = 0x22
}
for ($i = 1; $i -le 12; $i++) { $VK["f$i"] = 0x6F + $i }

function Press-Chord($spec) {
    $parts = @(([string]$spec).ToLower().Split('+') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($parts.Count -eq 0) { Fail 'bad_key' 'A key is required.' }
    $key = $parts[$parts.Count - 1]
    $mods = @()
    $modNames = @()
    if ($parts.Count -gt 1) { $modNames = @($parts[0..($parts.Count - 2)]) }
    foreach ($m in $modNames) {
        switch ($m) {
            { $_ -in 'ctrl', 'control' } { $mods += 0x11 }
            { $_ -in 'alt', 'option', 'opt' } { $mods += 0x12 }
            'shift' { $mods += 0x10 }
            { $_ -in 'cmd', 'command', 'meta', 'win', 'super' } { $mods += 0x5B }
            default { Fail 'bad_key' "Unknown modifier `"$m`". Use ctrl, shift, alt or win." }
        }
    }
    if ($VK.ContainsKey($key)) { $code = $VK[$key] }
    elseif ($key.Length -eq 1) { $code = [int][char]([string]$key).ToUpper() }
    else { Fail 'bad_key' "Unknown key `"$spec`"." }
    foreach ($m in $mods) { [BbNative]::Key([uint16]$m, 0, $false, $false) }
    [BbNative]::Key([uint16]$code, 0, $false, $false)
    [BbNative]::Key([uint16]$code, 0, $true, $false)
    [array]::Reverse($mods)
    foreach ($m in $mods) { [BbNative]::Key([uint16]$m, 0, $true, $false) }
}

function Type-Text($text) {
    foreach ($ch in $text.ToCharArray()) {
        [BbNative]::Key(0, [uint16]$ch, $false, $true)
        [BbNative]::Key(0, [uint16]$ch, $true, $true)
        Start-Sleep -Milliseconds 4
    }
}

# --- requests ------------------------------------------------------------------------------------------

function Handle($req) {
    switch ($req.op) {
        'status' {
            $ok = $true
            try { [void]$AE::RootElement.Current.Name } catch { $ok = $false }
            return @{ trusted = $ok; message = 'Windows could not start UI Automation.' }
        }
        'apps' { return @{ apps = @(Get-Apps) } }
        'windows' {
            $proc = Find-App $req.app
            $i = 0
            $list = @(Get-Windows $proc | ForEach-Object {
                $i++
                $r = $_.Current.BoundingRectangle
                @{ index = $i; title = [string]$_.Current.Name; x = [int]$r.X; y = [int]$r.Y; width = [int]$r.Width; height = [int]$r.Height }
            })
            return @{ app = $proc.ProcessName; windows = $list }
        }
        'outline' {
            $proc = Find-App $req.app
            $windows = @(Get-Windows $proc)
            if ($windows.Count -eq 0) { Fail 'no_window' "$($proc.ProcessName) has no open window." }
            $maxNodes = if ($req.maxNodes) { [int]$req.maxNodes } else { 500 }
            $actionsOnly = [bool]$req.actionsOnly
            $script:table = @{}
            $script:generation++
            $lines = @()
            $truncated = $false
            if ($req.within) {
                $held = Get-Held $req.within
                $script:table = @{}
                $built = Build-Outline $held.el $proc.Id 1 $maxNodes 14 $actionsOnly
                $lines = @($built.lines); $truncated = $built.truncated
            } else {
                $targets = $windows
                if ($req.window) {
                    $w = [int]$req.window
                    if ($w -lt 1 -or $w -gt $windows.Count) { Fail 'no_window' "$($proc.ProcessName) has $($windows.Count) window(s); window $w does not exist." }
                    $targets = @($windows[$w - 1])
                } else { $targets = @($windows[0]) }
                $next = 1
                foreach ($t in $targets) {
                    $built = Build-Outline $t $proc.Id $next $maxNodes 14 $actionsOnly
                    $lines += @($built.lines); $truncated = $truncated -or $built.truncated
                    $next = ($script:table.Keys | Measure-Object -Maximum).Maximum + 1
                }
            }
            return @{ app = $proc.ProcessName; generation = $script:generation; marks = $script:table.Count; outline = ($lines -join "`n"); truncated = $truncated }
        }
        'act' {
            $item = Get-Held $req.mark
            $el = $item.el
            $p = $null
            $name = [string]$req.action
            if ((-not $name -or $name -eq 'AXPress') -and $el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return @{ did = 'Invoke' } }
            if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) { $p.Toggle(); return @{ did = 'Toggle' } }
            if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $p.Select(); return @{ did = 'Select' } }
            if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) {
                if ($p.Current.ExpandCollapseState -eq 'Expanded') { $p.Collapse() } else { $p.Expand() }
                return @{ did = 'ExpandCollapse' }
            }
            Fail 'action_failed' "$($item.name) offers no action of its own. Try desktop_click with mouse true."
        }
        'click' {
            $x = 0; $y = 0
            if ($req.mark) {
                $item = Get-Held $req.mark
                $c = Center $item.el
                if (-not $c) { Fail 'no_frame' 'That element has no position on screen.' }
                $x = $c.x; $y = $c.y
                $proc = Get-Process -Id $item.pid -ErrorAction SilentlyContinue
                if ($proc) { Focus-Window $proc }
            } elseif ($null -ne $req.x -and $null -ne $req.y) { $x = [int]$req.x; $y = [int]$req.y }
            else { Fail 'no_target' 'Give a mark or x and y.' }
            Click-At $x $y ([bool]$req.right) $(if ($req.double) { 2 } else { 1 })
            return @{ x = $x; y = $y }
        }
        'set_value' {
            $item = Get-Held $req.mark
            $p = $null
            if (-not $item.el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p) -or $p.Current.IsReadOnly) {
                Fail 'not_settable' 'That field does not allow its value to be set directly. Use desktop_type instead.'
            }
            $p.SetValue([string]$req.text)
            return @{ value = [string]$p.Current.Value }
        }
        'focus' { $item = Get-Held $req.mark; $item.el.SetFocus(); return @{} }
        'type' {
            if ($req.mark) {
                $item = Get-Held $req.mark
                $proc = Get-Process -Id $item.pid -ErrorAction SilentlyContinue
                if ($proc) { Focus-Window $proc }
                $item.el.SetFocus()
                Start-Sleep -Milliseconds 80
            } elseif ($req.app) { Focus-Window (Find-App $req.app) }
            Type-Text ([string]$req.text)
            return @{}
        }
        'key' {
            if ($req.app) { Focus-Window (Find-App $req.app) }
            foreach ($chord in ([string]$req.keys).Split(' ') | Where-Object { $_ }) { Press-Chord $chord; Start-Sleep -Milliseconds 30 }
            return @{}
        }
        'scroll' {
            if ($req.mark) {
                $c = Center (Get-Held $req.mark).el
                if ($c) { [void][BbNative]::SetCursorPos($c.x, $c.y) }
            }
            if ($req.dy) { [BbNative]::Mouse(0x0800, [int]$req.dy) }
            if ($req.dx) { [BbNative]::Mouse(0x1000, -[int]$req.dx) }
            return @{}
        }
        'read' {
            $item = Get-Held $req.mark
            $out = @{ role = $item.type; title = [string]$item.el.Current.Name; description = [string]$item.el.Current.HelpText }
            $v = Get-ElementValue $item.el
            if ($null -ne $v) { $out.value = [string]$v }
            return $out
        }
        'launch' {
            $name = [string]$req.app
            $running = $null
            try { $running = Find-App $name } catch { }
            if ($running) { Focus-Window $running; return @{ launched = $false; pid = $running.Id } }
            try { $p = Start-Process -FilePath $name -PassThru -ErrorAction Stop } catch { Fail 'no_app' "Could not open `"$name`": $($_.Exception.Message)" }
            Start-Sleep -Milliseconds 800
            return @{ launched = $true; pid = $p.Id }
        }
        'activate' { Focus-Window (Find-App $req.app); return @{} }
        'quit' {
            $proc = Find-App $req.app
            if ($req.force) { $proc.Kill(); return @{ asked = $true } }
            return @{ asked = [bool]$proc.CloseMainWindow() }
        }
        'screenshot' {
            if ($req.app) {
                $proc = Find-App $req.app
                Focus-Window $proc
                $w = @(Get-Windows $proc)[0]
                $r = $w.Current.BoundingRectangle
                $rect = New-Object System.Drawing.Rectangle ([int]$r.X), ([int]$r.Y), ([int]$r.Width), ([int]$r.Height)
            } else { $rect = [System.Windows.Forms.SystemInformation]::VirtualScreen }
            if ($rect.Width -le 0 -or $rect.Height -le 0) { Fail 'no_frame' 'That window has no size on screen.' }
            $bmp = New-Object System.Drawing.Bitmap $rect.Width, $rect.Height
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.CopyFromScreen($rect.X, $rect.Y, 0, 0, $bmp.Size)
            $g.Dispose()
            $ms = New-Object System.IO.MemoryStream
            $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
            $bmp.Dispose()
            return @{ base64 = [Convert]::ToBase64String($ms.ToArray()); mime = 'image/jpeg' }
        }
        'clipboard_get' { return @{ text = [string][System.Windows.Forms.Clipboard]::GetText() } }
        'clipboard_set' {
            if ([string]$req.text) { [System.Windows.Forms.Clipboard]::SetText([string]$req.text) } else { [System.Windows.Forms.Clipboard]::Clear() }
            return @{}
        }
        default { Fail 'unknown_op' "Unknown request `"$($req.op)`"." }
    }
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if (-not $line.Trim()) { continue }
    $req = $null
    try { $req = $line | ConvertFrom-Json } catch {
        Reply $null $false @{ code = 'bad_request'; error = 'Could not read the request.' }
        continue
    }
    try {
        Reply $req.id $true (Handle $req)
    } catch {
        $text = $_.Exception.Message
        $parts = $text.Split('|', 2)
        if ($parts.Count -eq 2 -and $parts[0] -match '^[a-z_]+$') { Reply $req.id $false @{ code = $parts[0]; error = $parts[1] } }
        else { Reply $req.id $false @{ code = 'error'; error = $text } }
    }
}
