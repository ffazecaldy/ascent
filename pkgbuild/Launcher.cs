// ============================================================
// ASCEND Launcher — avvia ascend-core.exe (il daemon pkg)
// accanto a sé, senza finestra, e attende la sua chiusura
// (il tasto Spegni nell'app termina il core → il launcher esce).
// Log: %LOCALAPPDATA%\Ascend\runtime\launcher.log — a ogni
// errore il MessageBox mostra le ultime righe di ascend.log.
// Icona: compilata con /win32icon (niente runtime patch).
// ============================================================
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class AscendLauncher
{
    static string RuntimeDir
    {
        get
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(local, "Ascend", "runtime");
        }
    }

    static void Log(string msg)
    {
        try
        {
            Directory.CreateDirectory(RuntimeDir);
            File.AppendAllText(
                Path.Combine(RuntimeDir, "launcher.log"),
                "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + msg + Environment.NewLine);
        }
        catch { /* il log è best effort */ }
    }

    static string TailLog(string file, int lines)
    {
        try
        {
            if (!File.Exists(file)) return "(nessun log dell'app: cerca ascend.log in " + RuntimeDir + ")";
            string[] all = File.ReadAllLines(file);
            int from = Math.Max(0, all.Length - lines);
            return string.Join(Environment.NewLine, all, from, all.Length - from);
        }
        catch (Exception ex) { return "(log non leggibile: " + ex.Message + ")"; }
    }

    [STAThread]
    static int Main(string[] args)
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string core = Path.Combine(dir, "ascend-core.exe");
        Log("avvio: " + string.Join(" ", args));

        if (!File.Exists(core))
        {
            string msg = "ascend-core.exe non trovato accanto ad Ascend.exe.\nCopia entrambi i file nella stessa cartella.";
            Log("ERRORE: core mancante");
            MessageBox.Show(msg, "Ascend", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        var psi = new ProcessStartInfo
        {
            FileName = core,
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        if (args.Length > 0)
        {
            psi.Arguments = string.Join(" ", Array.ConvertAll(args, a =>
                a.Contains(" ") ? "\"" + a.Replace("\"", "\\\"") + "\"" : a));
        }

        Process p = new Process { StartInfo = psi };
        try { p.Start(); }
        catch (Exception ex)
        {
            Log("ERRORE avvio processo: " + ex.Message);
            MessageBox.Show("Avvio di Ascend fallito: " + ex.Message, "Ascend",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        Log("core avviato (pid " + p.Id + ")");

        // Se il core muore subito (es. porta occupata) mostra il motivo reale
        // leggendo il log dell'app — così l'errore è sempre riportabile.
        if (p.WaitForExit(3000) && p.ExitCode != 0)
        {
            string tail = TailLog(Path.Combine(RuntimeDir, "ascend.log"), 15);
            Log("ERRORE: core uscito subito (exit " + p.ExitCode + ")");
            MessageBox.Show(
                "Ascend non è riuscito ad avviarsi (exit " + p.ExitCode + ").\n\n" + tail +
                "\n\nConsiglio: chiudi altre istanze di Ascend (o i servizi sulle porte 3000/4878) e riprova.",
                "Ascend", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return p.ExitCode;
        }
        p.WaitForExit();
        Log("core terminato (exit " + p.ExitCode + ")");
        return p.ExitCode;
    }
}