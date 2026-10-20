package edu.iitm.cs5013;

import edu.iitm.cs5013.server.DashboardServer;

import java.io.File;

/**
 * Main application entry point for CS5013 Multi-Modal Transportation Data Visualizer.
 */
public class Main {

    public static void main(String[] args) {
        int port = 8080;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {}
        } else if (System.getenv("PORT") != null) {
            try {
                port = Integer.parseInt(System.getenv("PORT"));
            } catch (NumberFormatException ignored) {}
        }

        // Determine base paths
        String currentDir = System.getProperty("user.dir", ".");
        String sampleDataPath = new File(currentDir, "sample_data").getAbsolutePath();
        String webFilesPath = new File(currentDir, "src/main/resources/web").getAbsolutePath();

        try {
            DashboardServer server = new DashboardServer(port, sampleDataPath, webFilesPath);
            server.start();

            Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        } catch (Exception e) {
            System.err.println("Failed to start Dashboard server: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
