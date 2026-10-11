import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Comparator;

import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/**
 * ELK Java 批量布局运行器: 一次性跑完一个目录下所有 .json 图 (单 JVM, 摊销启动成本).
 * 输出 (stdout, 逐文件):
 *   FILE <name>.json
 *   <indent><nodeId> x=<x> y=<y>      (相对父块坐标, indent=层级深度)
 *   END <name>.json
 *   或 ERR <name>.json <异常摘要>
 *
 * 用法: java -cp ... BatchMain <inputDir>
 * 输入: node scripts/probe.mjs export <elkt> -o <out.json>  (或 generate-jar-oracle 批量导出)
 */
public class BatchMain {

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("用法: BatchMain <inputDir>");
            System.exit(1);
        }
        File dir = new File(args[0]);
        File[] files = dir.listFiles((d, n) -> n.endsWith(".json"));
        if (files == null) { System.err.println("目录不存在: " + dir); System.exit(1); }
        Arrays.sort(files, Comparator.comparing(File::getName));

        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();

        for (File f : files) {
            try {
                String json = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
                ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
                root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
                new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
                System.out.println("FILE " + f.getName());
                dumpCoords(root, "");
                System.out.println("END " + f.getName());
            } catch (Throwable t) {
                System.out.println("ERR " + f.getName() + " " + t.toString().replace('\n', ' '));
            }
        }
    }

    static void dumpCoords(ElkNode n, String indent) {
        System.out.println(indent + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY());
        for (ElkNode c : n.getChildren()) dumpCoords(c, indent + "  ");
    }
}
