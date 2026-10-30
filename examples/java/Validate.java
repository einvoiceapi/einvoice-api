// Validate an e-invoice with the EU E-Invoice API (Java 17+, JDK only).
//   EINVOICE_API_KEY=... java Validate.java invoice.pdf
// Prints the JSON result; parse it with the JSON library of your project (fields: valid, format, profile, findings[]
// with severity, ruleId, message, xpath, source, docUrl).
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;

public class Validate {

    public static void main(String[] args) throws Exception {
        String base = System.getenv().getOrDefault("EINVOICE_API_BASE_URL", "https://einvoice-api-main-f5141d8.zuplo.app");
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + "/v1/validate"))
            .header("Authorization", "Bearer " + System.getenv("EINVOICE_API_KEY"))
            .header("Content-Type", "application/octet-stream") // raw body; the format is detected from the content
            .timeout(Duration.ofSeconds(60))
            .POST(HttpRequest.BodyPublishers.ofFile(Path.of(args[0])))
            .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        // 200 = validation result (also for an invalid invoice: "valid": false); otherwise RFC 9457 problem+json
        System.out.println("HTTP " + response.statusCode());
        System.out.println(response.body());
        System.exit(response.statusCode() == 200 && response.body().contains("\"valid\":true") ? 0 : 1);
    }
}
