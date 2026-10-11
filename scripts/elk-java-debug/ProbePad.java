import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.graph.ElkNode;

public class ProbePad {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        ElkNode n1 = root.getChildren().get(0);
        org.eclipse.elk.core.math.ElkPadding pad = org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator
            .computeInsideNodeLabelPadding(
                org.eclipse.elk.core.util.adapters.ElkGraphAdapters.adapt(root),
                org.eclipse.elk.core.util.adapters.ElkGraphAdapters.adaptSingleNode(n1),
                org.eclipse.elk.core.options.Direction.RIGHT);
        System.out.println("computeInsideNodeLabelPadding N1 = " + pad);
        // 也打印 spacing 默认值
        System.out.println("labelLabelSpacing=" + n1.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.SPACING_LABEL_LABEL));
        System.out.println("nodeLabelsPadding=" + n1.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_LABELS_PADDING));
    }
}
