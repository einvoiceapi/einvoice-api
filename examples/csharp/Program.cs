// Validate an e-invoice with the EU E-Invoice API (.NET 8+, no packages).
//   dotnet new console -o Validate && copy Program.cs into it, then: EINVOICE_API_KEY=... dotnet run -- invoice.pdf
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

var baseUrl = Environment.GetEnvironmentVariable("EINVOICE_API_BASE_URL") ?? "https://einvoice-api-main-f5141d8.zuplo.app";
using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
http.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("EINVOICE_API_KEY"));

// raw body; the format is detected from the content
var body = new ByteArrayContent(await File.ReadAllBytesAsync(args[0]));
body.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
var response = await http.PostAsync($"{baseUrl}/v1/validate", body);
if (!response.IsSuccessStatusCode)
{
    // RFC 9457 problem+json: "detail" says what to fix
    var problem = await response.Content.ReadFromJsonAsync<Problem>();
    Console.Error.WriteLine($"HTTP {(int)response.StatusCode}: {problem?.Detail ?? problem?.Title}");
    return 2;
}
var result = await response.Content.ReadFromJsonAsync<ValidationResponse>();
Console.WriteLine($"valid: {result!.Valid}  format: {result.Format}  profile: {result.Profile}");
foreach (var f in result.Findings)
{
    Console.WriteLine($"{f.Severity,-7} {f.RuleId}: {f.Message}");
    if (f.DocUrl is not null) Console.WriteLine($"        {f.DocUrl}");
}
return result.Valid ? 0 : 1;

record Finding(
    [property: JsonPropertyName("severity")] string Severity,
    [property: JsonPropertyName("ruleId")] string RuleId,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("xpath")] string? Xpath,
    [property: JsonPropertyName("docUrl")] string? DocUrl);

record ValidationResponse(
    [property: JsonPropertyName("valid")] bool Valid,
    [property: JsonPropertyName("format")] string? Format,
    [property: JsonPropertyName("profile")] string? Profile,
    [property: JsonPropertyName("findings")] List<Finding> Findings);

record Problem(
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("detail")] string? Detail);
