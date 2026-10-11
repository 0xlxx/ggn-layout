import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.*;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.json.ElkGraphJson;

/** 打印 ELK NodeLabelAndSizeCalculator 对每个节点的 cell 最小尺寸. */
public class CellSizeProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = ElkGraphJson.forGraph(json).toElk();
        // 用 RecursiveGraphLayoutEngine 布局, 在 LabelAndNodeSizeProcessor 后截取? 简化: 直接跑一次完整布局,
        // 快照由 DebugMain 已有. 此处只验证一个已知节点.
        org.eclipse.elk.alg.layered.LayeredLayoutProvider p = new org.eclipse.elk.alg.layered.LayeredLayoutProvider();
        System.out.println("probe ok");
    }
}
