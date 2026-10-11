import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/**
 * 跑完整布局后导出 ELK JSON (含最终边弯点/端口标签位置).
 *
 * 批量模式: 每个输入文件先打印一行 "### <file>" 标记 (出错打印 "###ERR <file>"),
 * 再输出一行 JSON, 供 scripts/verify-elkg-java-layout.ts 一次性 JVM 处理多个模型.
 *
 * 用法: java -cp "out-edge:lib/*" LayoutJsonMain <file1.elk.json> [<file2.elk.json> ...]
 * 注意: classpath 必须用 lib/* 的 signed 0.12.0 jar (勿混入 elk-layered-unsigned*).
 */
public class LayoutJsonMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        for (String file : args) {
            try {
                String json = new String(Files.readAllBytes(new java.io.File(file).toPath()), StandardCharsets.UTF_8);
                ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
                root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
                BasicProgressMonitor m = new BasicProgressMonitor();
                m.begin("root", 1);
                new RecursiveGraphLayoutEngine().layout(root, m);
                m.done();
                System.out.println("### " + file);
                System.out.println(org.eclipse.elk.graph.json.ElkGraphJson.forGraph(root).toJson());
            } catch (Exception ex) {
                System.out.println("###ERR " + file);
                System.err.println(file + ": " + ex);
            }
        }
    }
}
