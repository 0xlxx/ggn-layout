/** ElkOptionsMain — 打印 ELK 注册的全部选项: 完整 key + 类型 + 默认值. */
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.data.LayoutOptionData;

public class ElkOptionsMain {
    public static void main(String[] args) {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        for (LayoutOptionData d : LayoutMetaDataService.getInstance().getOptionData()) {
            System.out.println(d.getId() + "\t" + d.getType());
        }
    }
}
