[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$mdbPath = "C:\YsMuhaseb\Muhaseb.mdb"
$pwd = "772587"
$connStr = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$mdbPath;Jet OLEDB:Database Password=$pwd;"

$conn = New-Object -ComObject ADODB.Connection
$conn.Open($connStr)

$cat = New-Object -ComObject ADOX.Catalog
$cat.ActiveConnection = $conn

# 1. User Tables, Columns, Primary Keys, Indexes
$tables = @()
$tableNames = @()

foreach ($tbl in $cat.Tables) {
    if ($tbl.Type -eq "TABLE" -and -not $tbl.Name.StartsWith("MSys")) {
        $tableNames += $tbl.Name
        $cols = @()
        foreach ($c in $tbl.Columns) {
            $colInfo = @{
                Name = $c.Name
                Type = $c.Type
                DefinedSize = $c.DefinedSize
                Precision = $c.Precision
                NumericScale = $c.NumericScale
                Attributes = $c.Attributes
            }
            $cols += $colInfo
        }

        $pks = @()
        $indexes = @()
        foreach ($idx in $tbl.Indexes) {
            $idxCols = @()
            foreach ($ic in $idx.Columns) { $idxCols += $ic.Name }
            if ($idx.PrimaryKey) {
                $pks = $idxCols
            } else {
                $indexes += @{
                    Name = $idx.Name
                    Unique = $idx.Unique
                    Columns = $idxCols
                }
            }
        }

        $tables += @{
            Name = $tbl.Name
            Columns = $cols
            PrimaryKey = $pks
            Indexes = $indexes
        }
    }
}

Write-Host "Processed $($tables.Count) user tables."

# 2. Extract Data Rows
$data = @{}
foreach ($tName in $tableNames) {
    $rows = @()
    $rs = New-Object -ComObject ADODB.Recordset
    $rs.Open("SELECT * FROM [$tName]", $conn, 0, 1) # adOpenForwardOnly, adLockReadOnly
    
    $fCount = $rs.Fields.Count
    $colNames = @()
    for ($i = 0; $i -lt $fCount; $i++) {
        $colNames += $rs.Fields.Item($i).Name
    }

    while (-not $rs.EOF) {
        $row = @{}
        for ($i = 0; $i -lt $fCount; $i++) {
            $fName = $colNames[$i]
            $val = $rs.Fields.Item($i).Value
            if ($null -eq $val -or [System.DBNull]::Value.Equals($val)) {
                $row[$fName] = $null
            } elseif ($rs.Fields.Item($i).Type -eq 11) { # Boolean
                $row[$fName] = [bool]$val
            } elseif ($rs.Fields.Item($i).Type -eq 7) { # Date
                $row[$fName] = ([datetime]$val).ToString("yyyy-MM-dd HH:mm:ss")
            } elseif ($rs.Fields.Item($i).Type -eq 205 -or $rs.Fields.Item($i).Type -eq 204) { # Blob
                # Convert bytes to base64
                if ($val) {
                    $bytes = [byte[]]$val
                    $row[$fName] = [Convert]::ToBase64String($bytes)
                } else {
                    $row[$fName] = $null
                }
            } else {
                $row[$fName] = $val
            }
        }
        $rows += $row
        $rs.MoveNext()
    }
    $rs.Close()

    if ($rows.Count -gt 0) {
        Write-Host "Table $tName has $($rows.Count) rows"
        $data[$tName] = $rows
    }
}

# 3. Extract Views (19 views)
$views = @()
foreach ($v in $cat.Views) {
    try {
        $views += @{
            Name = $v.Name
            CommandText = $v.Command.CommandText
        }
    } catch {
        Write-Host "Could not get view $($v.Name): $_"
    }
}
Write-Host "Extracted $($views.Count) views."

# 4. Extract Procedures (37 procedures)
$procedures = @()
foreach ($p in $cat.Procedures) {
    try {
        $procedures += @{
            Name = $p.Name
            CommandText = $p.Command.CommandText
        }
    } catch {
        Write-Host "Could not get procedure $($p.Name): $_"
    }
}
Write-Host "Extracted $($procedures.Count) procedures."

$conn.Close()

# Save as UTF8 JSON
$result = @{
    Source = $mdbPath
    Tables = $tables
    Data = $data
    Views = $views
    Procedures = $procedures
}

$json = $result | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText("f:\KAYAN_ERP2026\access_export.json", $json, [System.Text.Encoding]::UTF8)

Write-Host "Successfully exported full database to access_export.json! File size: $( (Get-Item f:\KAYAN_ERP2026\access_export.json).Length ) bytes"
