// ============================================================
// ASCEND Launcher — avvia ascend-core.exe (il daemon pkg)
// accanto a sé, senza finestra, e attende la sua chiusura
// (il tasto Spegni nell'app termina il core → il launcher esce).
// Icona: compilata con /win32icon (niente runtime patch).
// ============================================================
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class AscendLauncher
{
    [STAThread]
    static int Main(string[] args)
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string core = Path.Combine(dir, "ascend-core.exe");
        if (!File.Exists(core))
        {
            MessageBox.Show(
                "ascend-core.exe non trovato accanto ad Ascend.exe.\n" +
                "Copia entrambi i file nella stessa cartella.",
                "Ascend", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show("Avvio di Ascend fallito: " + ex.Message, "Ascend",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        // Se il core muore subito (es. porta occupata) avvisa; altrimenti attende.
        if (p.WaitForExit(2500) && p.ExitCode != 0)
        {
            MessageBox.Show(
                "Ascend non è riuscito ad avviarsi (probabilmente una porta è già occupata).\n" +
                "Chiudi le altre istanze di Ascend e riprova.",
                "Ascend", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return p.ExitCode;
        }
        p.WaitForExit();
        return p.ExitCode;
    }
}