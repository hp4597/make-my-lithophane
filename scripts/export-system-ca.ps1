$ErrorActionPreference = 'Stop'
if (-not $env:NODE_EXTRA_CA_CERTS) { throw 'NODE_EXTRA_CA_CERTS must name the output PEM file.' }
$pem = [System.Collections.Generic.List[string]]::new()
$locations = @(
    [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
)
foreach ($location in $locations) {
    foreach ($storeName in @('Root', 'CA')) {
        $store = [System.Security.Cryptography.X509Certificates.X509Store]::new($storeName, $location)
        try {
            $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
            foreach ($certificate in $store.Certificates) {
                $base64 = [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks)
                $pem.Add('-----BEGIN CERTIFICATE-----' + [Environment]::NewLine + $base64 + [Environment]::NewLine + '-----END CERTIFICATE-----')
            }
        } finally {
            $store.Dispose()
        }
    }
}
if ($pem.Count -eq 0) { throw 'Windows returned no trusted certificates.' }
[IO.File]::WriteAllText($env:NODE_EXTRA_CA_CERTS, ($pem -join [Environment]::NewLine), [Text.Encoding]::ASCII)
Write-Host ('Using {0} public Windows certificates for this build.' -f $pem.Count)
